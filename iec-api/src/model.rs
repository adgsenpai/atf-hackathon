use serde::{Deserialize, Serialize};

/// Registration levels exposed by the IEC "Political parties information" filter.
/// `value` is the checkbox value the site expects; `index` is the checkbox position.
pub const LEVELS: [(usize, &str, &str); 5] = [
    (0, "1", "National"),
    (1, "2", "Municipal"),
    (2, "3", "Provincial"),
    (3, "4", "District"),
    (4, "5", "Metro"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Party {
    /// Stable slug derived from the display name, used in API paths.
    pub id: String,
    /// Name exactly as shown on the IEC site, e.g. "ACTIONSA-ACTIONSA".
    pub display_name: String,
    /// Party name with the trailing abbreviation removed.
    pub name: String,
    /// Abbreviation, or `None` when the IEC lists `NO_ABBR`.
    pub abbreviation: Option<String>,
    /// Levels the party is registered at (from the level filter that returned it).
    pub levels: Vec<String>,
    pub contact_person: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub website: Option<String>,
    /// Original logo URL on elections.org.za.
    pub logo_url: Option<String>,
    /// Path of the downloaded logo relative to the data dir, e.g. "logos/img_parties/ANC.jpg".
    pub logo_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Dataset {
    pub source: String,
    pub scraped_at: String,
    pub count: usize,
    pub logos_downloaded: usize,
    pub parties: Vec<Party>,
}

pub fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut dash = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() { "party".into() } else { out }
}

/// "ABAFUNA INGUBO YESKHETHU PARTY-INGUBO" -> ("ABAFUNA INGUBO YESKHETHU PARTY", Some("INGUBO"))
/// "#HOPE4SA-NO_ABBR" -> ("#HOPE4SA", None)
pub fn split_name(display: &str) -> (String, Option<String>) {
    match display.rsplit_once('-') {
        Some((name, abbr)) if !name.trim().is_empty() && !abbr.trim().is_empty() => {
            let abbr = abbr.trim();
            let abbr = if abbr.eq_ignore_ascii_case("NO_ABBR") { None } else { Some(abbr.to_string()) };
            (name.trim().to_string(), abbr)
        }
        _ => (display.trim().to_string(), None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_names() {
        assert_eq!(split_name("#HOPE4SA-NO_ABBR"), ("#HOPE4SA".into(), None));
        assert_eq!(
            split_name("ABAFUNA INGUBO YESKHETHU PARTY-INGUBO"),
            ("ABAFUNA INGUBO YESKHETHU PARTY".into(), Some("INGUBO".into()))
        );
        assert_eq!(split_name("PLAIN"), ("PLAIN".into(), None));
    }

    #[test]
    fn slugs() {
        assert_eq!(slugify("#HOPE4SA-NO_ABBR"), "hope4sa-no-abbr");
        assert_eq!(slugify("A.B.C.D"), "a-b-c-d");
    }
}
