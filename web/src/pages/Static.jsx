import { Link } from 'react-router-dom';

export function Methods() {
  return (
    <div className="container page prose">
      <h1>Data &amp; methods</h1>
      <p className="muted">How CivicWatch Africa collects, labels and counts information.</p>

      <h2>Where the data comes from</h2>
      <ul>
        <li><strong>Resident reports</strong> are submitted on this platform and may be unverified.</li>
        <li><strong>Status changes</strong> are either <em>user-reported</em> (proposed by residents with evidence and approved by moderators) or <em>municipality confirmed</em> (recorded by a verified municipal account or an official integration).</li>
        <li><strong>Boundaries</strong> (the Western Cape, its 5 districts, 25 metro and local municipalities and 406 wards) are the Municipal Demarcation Board's 2021 electoral boundaries, served by OpenUp MapIt.</li>
        <li><strong>Election results</strong> are the IEC Seat Calculation Detail reports for every council in the 2026 and 2021 Local Government Elections. "Total valid votes" combines ward and PR ballots, as the IEC seat calculation does. District councils show only the directly elected 40% of seats.</li>
        <li><strong>Contacts</strong> (switchboard, website, address) come from the National Treasury municipal register. <strong>Who is responsible</strong> follows the Constitution (Schedules 4B and 5B) and the Municipal Structures Act (s84).</li>
        <li><strong>Resident reports, comments and the ward accountability showcase</strong> are demo activity generated for this build. The showcase uses fictional parties only and gives every party identical odds.</li>
        <li><strong>Registered political parties</strong> are real data: the IEC register of parties (name, abbreviation, registration level, contact details and logo), scraped from elections.org.za and served by our IEC party API. Each view shows the scrape date. Registration says who may contest; it carries no votes, seats or performance. See <Link to="/parties">Parties</Link>.</li>
        <li><strong>Council composition</strong> is the council as elected (IEC seat allocation). The governing arrangement and executive mayor are recorded only once a source confirms them; control is never inferred from results.</li>
      </ul>

      <h2>How we calculate</h2>
      <ul>
        <li><strong>Reports received</strong>: count of reports with an observed date in the period, with merged duplicates removed.</li>
        <li><strong>Share acknowledged</strong>: reports with a first status of Acknowledged or later, divided by all reports, split by official and user-reported.</li>
        <li><strong>Median time to first acknowledgement</strong>: the middle value of (first acknowledgement − submission time), only for reports that have one.</li>
        <li><strong>Share resolved</strong>: reports whose current status is Resolved. Reopened reports count as not resolved.</li>
        <li><strong>Overdue against a target</strong>: shown only when a verified official service target exists.</li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>Combine election results, council control and service performance into one score.</li>
        <li>Rank municipalities, wards or officials.</li>
        <li>Colour-code political parties.</li>
      </ul>

      <h2>Privacy</h2>
      <p>Location data (EXIF) is stripped from every uploaded photo. Sensitive reports show only an approximate area (about 1 km). Residents appear under a pseudonym.</p>
      <p>Performance data can be downloaded as CSV from each municipality’s <Link to="/municipalities/city-of-cape-town/performance">performance page</Link>.</p>
    </div>
  );
}

export function Rules() {
  return (
    <div className="container page prose">
      <h1>Community rules</h1>
      <p className="muted">These rules keep reports useful and fair. Moderators apply them with a recorded reason, and every decision can be appealed.</p>
      <ol>
        <li><strong>Describe problems, not people.</strong> Do not name or accuse individuals without a source. (Unsupported personal accusation)</li>
        <li><strong>No harassment</strong> of residents, officials or moderators.</li>
        <li><strong>Protect privacy.</strong> No phone numbers, home addresses, faces or house numbers in text or photos.</li>
        <li><strong>Stay on topic.</strong> Comments should help others understand or follow up the report.</li>
        <li><strong>No spam or advertising.</strong></li>
        <li><strong>Back up status changes with evidence</strong>, such as a reference number, an official reply or a photo.</li>
      </ol>
      <h2>How moderation works</h2>
      <p>Anyone can flag a report, photo or comment. Moderators choose to keep, redact, remove, warn or escalate. Every action needs a reason code and is saved to an append-only audit log with the content before and after.</p>
      <p>If your content is removed you will see which rule it broke and can appeal. A reviewer other than the original decision-maker handles appeals.</p>
      <p><strong>Emergencies:</strong> call your local emergency number. This site is not monitored around the clock.</p>
    </div>
  );
}

export function NotFound() {
  return <div className="container page"><h1>Page not found</h1><p><Link to="/">Go to the home page</Link></p></div>;
}
