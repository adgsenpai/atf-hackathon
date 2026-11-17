//! Scraper for https://www.elections.org.za/pw/Parties-And-Candidates/Party-Contact-Information
//!
//! The page is an ASP.NET WebForms page: party cards only render after a postback
//! (ticking a level checkbox), and paging is a stateful "Next" submit button. We walk
//! every level × every page, carrying __VIEWSTATE/__EVENTVALIDATION forward.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use futures::{StreamExt, stream};
use scraper::{ElementRef, Html, Selector};

use crate::model::{Dataset, LEVELS, Party, slugify, split_name};

pub const PARTY_URL: &str =
    "https://www.elections.org.za/pw/Parties-And-Candidates/Party-Contact-Information";
/// Identify ourselves honestly. (A spoofed browser UA gets a Cloudflare challenge.)
pub const USER_AGENT: &str = concat!("civicwatch-iec-scraper/", env!("CARGO_PKG_VERSION"));

const CHECKBOX: &str = "ctl00$MainContent$cblPartyRegLevels$";
const SEARCH_TEXT: &str = "ctl00$MainContent$uxSearchText";
const NEXT_BUTTON: &str = "ctl00$MainContent$uxPartyListView$uxPartyListDataPager$ctl02$ctl00";
const MAX_PAGES_PER_LEVEL: usize = 2000;

pub struct ScrapeOptions {
    pub out_dir: PathBuf,
    pub delay: Duration,
    pub skip_logos: bool,
    pub logo_concurrency: usize,
}

/// One parsed party card from a results page.
#[derive(Debug, Clone)]
struct Card {
    display_name: String,
    contact_person: Option<String>,
    telephone: Option<String>,
    email: Option<String>,
    address: Option<String>,
    website: Option<String>,
    logo_url: Option<String>,
}

struct Page {
    hidden: Vec<(String, String)>,
    cards: Vec<Card>,
    has_next: bool,
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("valid selector")
}

fn clean(s: &str) -> Option<String> {
    let t = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.is_empty() { None } else { Some(t) }
}

fn text_of(el: &ElementRef, css: &str) -> Option<String> {
    el.select(&sel(css)).next().and_then(|e| clean(&e.text().collect::<String>()))
}

fn parse_page(html: &str) -> Page {
    let doc = Html::parse_document(html);

    let hidden = doc
        .select(&sel("form#uxForm input[type=hidden]"))
        .filter_map(|e| {
            let name = e.value().attr("name")?;
            Some((name.to_string(), e.value().attr("value").unwrap_or("").to_string()))
        })
        .collect();

    let mut cards = Vec::new();
    for card in doc.select(&sel("div.card.mb-3.border-0")) {
        let Some(display_name) = text_of(&card, "div.card-header h3.card-title") else { continue };
        let logo_url = card
            .select(&sel("img.card-img"))
            .next()
            .and_then(|i| i.value().attr("src"))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let website = card
            .select(&sel("a[id*='uxPartyWebsiteDataField']"))
            .next()
            .and_then(|a| a.value().attr("href").and_then(clean).or_else(|| clean(&a.text().collect::<String>())));
        cards.push(Card {
            display_name,
            contact_person: text_of(&card, "p[id*='uxPartyContactNameDataField']"),
            telephone: text_of(&card, "p[id*='uxPartyTelephoneDataField']"),
            // The IEC page labels this field "Email" but its id says "Fax".
            email: text_of(&card, "p[id*='uxPartyFaxDataField']"),
            address: text_of(&card, "p[id*='uxPartyAddressDataField']"),
            website,
            logo_url,
        });
    }

    let has_next = doc
        .select(&sel(&format!("input[name='{NEXT_BUTTON}']")))
        .next()
        .is_some_and(|e| e.value().attr("disabled").is_none());

    Page { hidden, cards, has_next }
}

async fn post(client: &reqwest::Client, form: &[(String, String)]) -> Result<String> {
    let mut last_err = None;
    for attempt in 1..=4u64 {
        match client.post(PARTY_URL).form(form).send().await {
            Ok(r) if r.status().is_success() => return Ok(r.text().await?),
            Ok(r) => last_err = Some(anyhow::anyhow!("HTTP {}", r.status())),
            Err(e) => last_err = Some(e.into()),
        }
        tokio::time::sleep(Duration::from_secs(2 * attempt)).await;
    }
    Err(last_err.unwrap())
}

/// Scrape all party cards for one registration level.
async fn scrape_level(
    client: &reqwest::Client,
    idx: usize,
    value: &str,
    label: &str,
    delay: Duration,
) -> Result<Vec<Card>> {
    // Fresh GET per level so viewstate/filter state starts clean.
    let first = client.get(PARTY_URL).send().await?.error_for_status()?.text().await?;
    let mut hidden = parse_page(&first).hidden;
    if hidden.is_empty() {
        bail!("no WebForms hidden fields found; page layout may have changed or request was blocked");
    }
    let checkbox = (format!("{CHECKBOX}{idx}"), value.to_string());

    // Tick the checkbox (AutoPostBack).
    let mut form = hidden.clone();
    set(&mut form, "__EVENTTARGET", &checkbox.0);
    set(&mut form, "__EVENTARGUMENT", "");
    form.push(checkbox.clone());
    form.push((SEARCH_TEXT.into(), String::new()));

    let mut all = Vec::new();
    for page_no in 1..=MAX_PAGES_PER_LEVEL {
        let html = post(client, &form).await.with_context(|| format!("{label} page {page_no}"))?;
        let page = parse_page(&html);
        tracing::info!(level = label, page = page_no, cards = page.cards.len(), "scraped page");
        all.extend(page.cards);
        if !page.has_next {
            break;
        }
        hidden = page.hidden;
        form = hidden.clone();
        set(&mut form, "__EVENTTARGET", "");
        set(&mut form, "__EVENTARGUMENT", "");
        form.push(checkbox.clone());
        form.push((SEARCH_TEXT.into(), String::new()));
        form.push((NEXT_BUTTON.into(), "Next".into()));
        tokio::time::sleep(delay).await;
    }
    Ok(all)
}

fn set(form: &mut Vec<(String, String)>, key: &str, val: &str) {
    if let Some(kv) = form.iter_mut().find(|(k, _)| k == key) {
        kv.1 = val.to_string();
    } else {
        form.push((key.to_string(), val.to_string()));
    }
}

/// "https://www.elections.org.za/content/img_parties/A B.jpg" -> "logos/img_parties/A_B.jpg"
fn logo_rel_path(url: &str) -> Option<String> {
    let u = reqwest::Url::parse(url).ok()?;
    let segs: Vec<&str> = u.path_segments()?.filter(|s| !s.is_empty()).collect();
    let file = segs.last()?;
    let dir = if segs.len() >= 2 { segs[segs.len() - 2] } else { "misc" };
    let safe = |s: &str| -> String {
        let decoded = urlencoding_decode(s);
        decoded
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
            .collect()
    };
    Some(format!("logos/{}/{}", safe(dir), safe(file)))
}

fn urlencoding_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(b) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

async fn download_logos(client: &reqwest::Client, out_dir: &Path, parties: &mut [Party], conc: usize) -> usize {
    // Unique URL -> relative path
    let mut jobs: BTreeMap<String, String> = BTreeMap::new();
    for p in parties.iter() {
        if let Some(url) = &p.logo_url {
            if let Some(rel) = logo_rel_path(url) {
                jobs.insert(url.clone(), rel);
            }
        }
    }
    tracing::info!(count = jobs.len(), "downloading logos");

    let results: Vec<(String, Option<String>)> = stream::iter(jobs.into_iter())
        .map(|(url, rel)| {
            let client = client.clone();
            let dest = out_dir.join(&rel);
            async move {
                if dest.exists() {
                    return (url, Some(rel));
                }
                let res: Result<()> = async {
                    let resp = client.get(&url).send().await?.error_for_status()?;
                    let bytes = resp.bytes().await?;
                    if let Some(parent) = dest.parent() {
                        tokio::fs::create_dir_all(parent).await?;
                    }
                    tokio::fs::write(&dest, &bytes).await?;
                    Ok(())
                }
                .await;
                match res {
                    Ok(()) => (url, Some(rel)),
                    Err(e) => {
                        tracing::warn!(%url, error = %e, "logo download failed");
                        (url, None)
                    }
                }
            }
        })
        .buffer_unordered(conc.max(1))
        .collect()
        .await;

    let ok: BTreeMap<String, String> = results.into_iter().filter_map(|(u, r)| r.map(|r| (u, r))).collect();
    for p in parties.iter_mut() {
        p.logo_file = p.logo_url.as_ref().and_then(|u| ok.get(u).cloned());
    }
    ok.len()
}

pub fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .cookie_store(true)
        .timeout(Duration::from_secs(90))
        .build()?)
}

pub async fn run(opts: &ScrapeOptions) -> Result<Dataset> {
    let client = client()?;

    // display_name -> (card, levels)
    let mut merged: BTreeMap<String, (Card, BTreeSet<&'static str>)> = BTreeMap::new();
    for (idx, value, label) in LEVELS {
        let cards = scrape_level(&client, idx, value, label, opts.delay).await?;
        tracing::info!(level = label, parties = cards.len(), "level done");
        for c in cards {
            merged
                .entry(c.display_name.clone())
                .or_insert_with(|| (c, BTreeSet::new()))
                .1
                .insert(label);
        }
    }

    let mut used_ids: BTreeMap<String, usize> = BTreeMap::new();
    let mut parties: Vec<Party> = merged
        .into_values()
        .map(|(c, levels)| {
            let (name, abbreviation) = split_name(&c.display_name);
            let base = slugify(&c.display_name);
            let n = used_ids.entry(base.clone()).or_insert(0);
            *n += 1;
            let id = if *n == 1 { base } else { format!("{base}-{n}") };
            // Keep LEVELS order rather than alphabetical.
            let levels = LEVELS.iter().filter(|(_, _, l)| levels.contains(l)).map(|(_, _, l)| l.to_string()).collect();
            Party {
                id,
                display_name: c.display_name,
                name,
                abbreviation,
                levels,
                contact_person: c.contact_person,
                telephone: c.telephone,
                email: c.email,
                address: c.address,
                website: c.website,
                logo_url: c.logo_url,
                logo_file: None,
            }
        })
        .collect();

    tokio::fs::create_dir_all(&opts.out_dir).await?;
    let logos = if opts.skip_logos {
        0
    } else {
        download_logos(&client, &opts.out_dir, &mut parties, opts.logo_concurrency).await
    };

    let ds = Dataset {
        source: PARTY_URL.into(),
        scraped_at: chrono::Utc::now().to_rfc3339(),
        count: parties.len(),
        logos_downloaded: logos,
        parties,
    };
    let path = opts.out_dir.join("parties.json");
    tokio::fs::write(&path, serde_json::to_vec_pretty(&ds)?).await?;
    tracing::info!(path = %path.display(), parties = ds.count, logos, "wrote dataset");
    Ok(ds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logo_paths() {
        assert_eq!(
            logo_rel_path("https://www.elections.org.za/content/img_parties/HOPE4SA.jpg").as_deref(),
            Some("logos/img_parties/HOPE4SA.jpg")
        );
        assert_eq!(
            logo_rel_path("https://www.elections.org.za/content/img_parties_temp/A%20B.jpg").as_deref(),
            Some("logos/img_parties_temp/A_B.jpg")
        );
    }

    #[test]
    fn parses_card() {
        let html = r#"<form id="uxForm"><input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc" />
        <div class="card mb-3 border-0"><div class="card-header"><h3 class="card-title"> ACTIONSA-ACTIONSA </h3></div>
        <img class="card-img" src="https://www.elections.org.za/content/img_parties/ACTIONSA.jpg" />
        <p id="x_uxPartyContactNameDataField_0"> JANE DOE </p>
        <p id="x_uxPartyFaxDataField_0"> a@b.c </p>
        <a id="x_uxPartyWebsiteDataField_0" href="https://actionsa.org.za">site</a></div>
        <input type="submit" name="ctl00$MainContent$uxPartyListView$uxPartyListDataPager$ctl02$ctl00" value="Next" disabled="disabled" />
        </form>"#;
        let p = parse_page(html);
        assert_eq!(p.hidden, vec![("__VIEWSTATE".into(), "abc".into())]);
        assert_eq!(p.cards.len(), 1);
        assert_eq!(p.cards[0].display_name, "ACTIONSA-ACTIONSA");
        assert_eq!(p.cards[0].contact_person.as_deref(), Some("JANE DOE"));
        assert_eq!(p.cards[0].email.as_deref(), Some("a@b.c"));
        assert_eq!(p.cards[0].website.as_deref(), Some("https://actionsa.org.za"));
        assert!(!p.has_next);
    }
}
