// Profile, Studio, Tracker, Agent, Settings
import React, { useEffect, useRef, useState } from 'react';
import IP from './ip-data.js';
import { Btn, Card, Empty, Icon, PageHead, SampleBadge, ScoreRing, Tag } from './ip-ui.jsx';
import { apiRequest } from './api.js';

function ListEditor({ label, items, onChange, placeholder }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setV(''); };
  return (
    <div className="le">
      <div className="mono tiny muted">{label.toUpperCase()}</div>
      <div className="skills-line">
        {items.map((s) => <span key={s} className="tag tag-neutral editable">{s}<button aria-label={`Remove ${s}`} onClick={() => onChange(items.filter((x) => x !== s))}>×</button></span>)}
        <input className="le-in" value={v} placeholder={placeholder || 'Add…'} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} aria-label={`Add to ${label}`} />
      </div>
    </div>
  );
}

function Profile({ ctx }) {
  const { profile, setProfile, toast } = ctx;
  const [state, setState] = useState({ phase: 'idle' });
  const fileRef = useRef(null);
  const set = (k) => (val) => setProfile({ ...profile, [k]: val, _sample: false });

  async function handle(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setState({ phase: 'error', msg: 'Only PDF files are accepted.' });
    if (file.size > 5 * 1024 * 1024) return setState({ phase: 'error', msg: 'File is larger than 5 MB.' });
    setState({ phase: 'reading', name: file.name });
    try {
      const buf = await file.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 5));
      if (String.fromCharCode(...head) !== '%PDF-') throw new Error('File does not have a valid PDF header.');
      const [pdfjsLib, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
      const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i); const c = await pg.getTextContent();
        let currentY = null;
        let line = '';
        for (const item of c.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const y = item.transform?.[5];
          if (currentY !== null && typeof y === 'number' && Math.abs(y - currentY) > 2) {
            text += `${line.trim()}\n`;
            line = '';
          } else if (line && !/\s$/.test(line) && !/^[,.;:!?)]/.test(item.str)) {
            line += ' ';
          }
          line += item.str;
          if (typeof y === 'number') currentY = y;
        }
        text += `${line.trim()}\n`;
      }
      if (text.trim().length < 40) throw new Error('No extractable text found. Scanned/image PDFs are not supported.');
      const ex = IP.extractResume(text);
      setProfile({
        ...IP.EMPTY_PROFILE,
        name: ex.name,
        email: ex.email,
        phone: ex.phone,
        location: ex.location,
        summary: ex.summary,
        resume_sections: ex.resume_sections,
        resume_text: ex.resume_text,
        programming_languages: ex.programming_languages,
        frameworks: ex.frameworks,
        ai_ml_skills: ex.ai_ml_skills,
        cloud_skills: ex.cloud_skills,
        _sample: false,
      });
      setState({
        phase: 'done',
        name: file.name,
        pages: pdf.numPages,
        chars: ex.chars,
        found: ex.programming_languages.length + ex.frameworks.length + ex.ai_ml_skills.length + ex.cloud_skills.length,
        sections: ex.resume_sections.length,
      });
    } catch (e) { setState({ phase: 'error', msg: e.message || 'Could not read PDF.' }); }
  }

  const upd = (k, i, field) => (e) => { const arr = [...profile[k]]; arr[i] = { ...arr[i], [field]: e.target.value }; set(k)(arr); };

  return (
    <div className="page">
      <PageHead title="Resume & profile" sub="Review everything we extracted. Matching only uses what's on this page." right={<>
        <Btn small icon="user-round" onClick={() => { setProfile(IP.SAMPLE_PROFILE); toast('Loaded sample profile'); }}>Load sample profile</Btn>
        <Btn small kind="ghost" icon="eraser" onClick={() => { if (confirm('Clear the entire profile?')) setProfile(IP.EMPTY_PROFILE); }}>Clear</Btn></>} />
      {profile._sample && <div className="banner"><SampleBadge /> You're viewing a fictional sample profile. Upload your own resume to replace it.</div>}
      <div className="grid-2 wide-right">
        <div className="col">
          <Card>
            <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); }} onClick={() => fileRef.current.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileRef.current.click()}>
              <Icon name="file-up" size={22} />
              <b>Drop a PDF resume</b><span className="muted small">or click to browse · max 5 MB</span>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => handle(e.target.files[0])} />
            </div>
            {state.phase === 'reading' && <p className="small muted st-line"><span className="spin" />Extracting text from {state.name}…</p>}
            {state.phase === 'error' && <p className="small err st-line"><Icon name="alert-circle" size={14} />{state.msg}</p>}
            {state.phase === 'done' && <p className="small ok-t st-line"><Icon name="check" size={14} />{state.name}: all {state.pages} page(s) read, {state.sections} resume section(s) kept, {state.chars.toLocaleString()} characters and {state.found} skills recognised. Review and correct the extracted details below.</p>}
          </Card>
          <Card>
            <div className="card-h"><h2>Privacy</h2></div>
            <ul className="priv small">
              <li>Text is extracted <b>locally in your browser</b>. The file is not uploaded or stored.</li>
              <li>Skill recognition is a deterministic keyword match — no model call.</li>
              <li>Your profile is only sent to Nebius when <b>you</b> click a generate action, and you're told first.</li>
            </ul>
          </Card>
          <Card>
            <div className="card-h"><h2>Structured extraction</h2><Tag mono>NEMOTRON · OPTIONAL</Tag></div>
            <p className="small muted">Projects, education and experience can be parsed by Nemotron with JSON-schema output. Disabled in demo mode — fill them in manually.</p>
          </Card>
        </div>
        <Card>
          <div className="form2">
            <label><span className="mono tiny muted">NAME</span><input value={profile.name} onChange={(e) => set('name')(e.target.value)} placeholder="Your name" /></label>
            <label><span className="mono tiny muted">EMAIL</span><input value={profile.email} onChange={(e) => set('email')(e.target.value)} placeholder="you@example.com" /></label>
            <label><span className="mono tiny muted">PHONE</span><input value={profile.phone || ''} onChange={(e) => set('phone')(e.target.value)} placeholder="Phone number" /></label>
            <label><span className="mono tiny muted">LOCATION</span><input value={profile.location || ''} onChange={(e) => set('location')(e.target.value)} placeholder="City, region or country" /></label>
          </div>
          <label className="profile-summary"><span className="mono tiny muted">SUMMARY / OBJECTIVE</span><textarea rows="3" value={profile.summary || ''} onChange={(e) => set('summary')(e.target.value)} placeholder="Resume summary or objective" /></label>
          {Array.isArray(profile.resume_sections) && profile.resume_sections.length > 0 && (
            <div className="resume-sections">
              <div className="sub-h"><span className="mono tiny muted">EXTRACTED RESUME SECTIONS · EDITABLE</span><button className="linkish tiny" onClick={() => set('resume_sections')([...profile.resume_sections, { heading: 'Additional details', content: '' }])}>+ Add section</button></div>
              {profile.resume_sections.map((section, i) => (
                <div className="resume-section" key={`${section.heading}-${i}`}>
                  <div className="form-x"><input aria-label={`Resume section ${i + 1} heading`} value={section.heading} onChange={(e) => { const sections = [...profile.resume_sections]; sections[i] = { ...section, heading: e.target.value }; set('resume_sections')(sections); }} placeholder="Section heading" /><button className="x" aria-label={`Remove ${section.heading} section`} onClick={() => set('resume_sections')(profile.resume_sections.filter((_, j) => j !== i))}>×</button></div>
                  <textarea rows="3" aria-label={`${section.heading} resume details`} value={section.content} onChange={(e) => { const sections = [...profile.resume_sections]; sections[i] = { ...section, content: e.target.value }; set('resume_sections')(sections); }} placeholder="Details extracted from this resume section" />
                </div>
              ))}
            </div>
          )}
          {profile.resume_text && <details className="resume-raw"><summary className="linkish tiny">View / edit all extracted resume text</summary><textarea rows="10" value={profile.resume_text} onChange={(e) => set('resume_text')(e.target.value)} aria-label="All extracted resume text" /></details>}
          <ListEditor label="Programming languages" items={profile.programming_languages} onChange={set('programming_languages')} />
          <ListEditor label="Frameworks & libraries" items={profile.frameworks} onChange={set('frameworks')} />
          <ListEditor label="AI / ML skills" items={profile.ai_ml_skills} onChange={set('ai_ml_skills')} />
          <ListEditor label="Cloud & tooling" items={profile.cloud_skills} onChange={set('cloud_skills')} />
          <ListEditor label="Other skills" items={profile.skills} onChange={set('skills')} />
          <ListEditor label="Preferred roles" items={profile.preferred_roles} onChange={set('preferred_roles')} placeholder="e.g. ML Intern" />
          <ListEditor label="Preferred locations" items={profile.preferred_locations} onChange={set('preferred_locations')} placeholder="e.g. Remote" />
          <ListEditor label="Certifications" items={profile.certifications} onChange={set('certifications')} />

          <div className="sub-h"><span className="mono tiny muted">EDUCATION</span><button className="linkish tiny" onClick={() => set('education')([...profile.education, { degree: '', school: '', year: '' }])}>+ Add</button></div>
          {profile.education.map((e, i) => (
            <div key={i} className="form3"><input value={e.degree} onChange={upd('education', i, 'degree')} placeholder="Degree, field" /><input value={e.school} onChange={upd('education', i, 'school')} placeholder="Institution" /><input value={e.year} onChange={upd('education', i, 'year')} placeholder="Year" /><button className="x" aria-label="Remove" onClick={() => set('education')(profile.education.filter((_, j) => j !== i))}>×</button></div>
          ))}
          <div className="sub-h"><span className="mono tiny muted">PROJECTS</span><button className="linkish tiny" onClick={() => set('projects')([...profile.projects, { name: '', desc: '', skills: [] }])}>+ Add</button></div>
          {profile.projects.map((p, i) => (
            <div key={i} className="entry">
              <div className="form-x"><input value={p.name} onChange={upd('projects', i, 'name')} placeholder="Project name" /><button className="x" aria-label="Remove" onClick={() => set('projects')(profile.projects.filter((_, j) => j !== i))}>×</button></div>
              <textarea rows="2" value={p.desc} onChange={upd('projects', i, 'desc')} placeholder="What you built, factually" />
              <input value={(p.skills || []).join(', ')} onChange={(e) => { const arr = [...profile.projects]; arr[i] = { ...p, skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }; set('projects')(arr); }} placeholder="Skills used, comma-separated" />
            </div>
          ))}
          <div className="sub-h"><span className="mono tiny muted">EXPERIENCE</span><button className="linkish tiny" onClick={() => set('experience')([...profile.experience, { role: '', org: '', months: 0, desc: '', skills: [] }])}>+ Add</button></div>
          {profile.experience.map((x, i) => (
            <div key={i} className="entry">
              <div className="form3"><input value={x.role} onChange={upd('experience', i, 'role')} placeholder="Role" /><input value={x.org} onChange={upd('experience', i, 'org')} placeholder="Organisation" /><input type="number" min="0" value={x.months} onChange={upd('experience', i, 'months')} placeholder="Months" /><button className="x" aria-label="Remove" onClick={() => set('experience')(profile.experience.filter((_, j) => j !== i))}>×</button></div>
              <input value={(x.skills || []).join(', ')} onChange={(e) => { const arr = [...profile.experience]; arr[i] = { ...x, skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }; set('experience')(arr); }} placeholder="Skills used, comma-separated" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const DOCS = [['cover', 'Cover letter'], ['recruiter', 'Recruiter message'], ['email', 'Application email'], ['highlights', 'Project highlights'], ['interview', 'Interview prep']];

function Studio({ ctx }) {
  const { ranked, studioJob, setStudioJob, profile, apps, saveApp, updateApp, toast, go, nebiusOk, backend } = ctx;
  const r = ranked.find((x) => x.job.id === studioJob) || ranked[0];
  const [tab, setTab] = useState('cover');
  const [docs, setDocs] = useState(null);
  const [src, setSrc] = useState('template');
  const [allowNebius, setAllowNebius] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    if (!r) return;
    const app = apps.find((a) => a.jobId === r.job.id);
    setDocs(app && app.materials ? app.materials : null);
    setAllowNebius(false);
    setGenerationError('');
  }, [r && r.job.id]);
  if (!r) return <Empty icon="pen-line" title="Nothing to write yet" body="Search for internships first." action={<Btn onClick={() => go('discover')}>Discover</Btn>} />;
  const gen = () => {
    setDocs(IP.drafts(r.job, profile, r.m));
    setSrc('template');
    setGenerationError('');
  };
  const genWithAI = async () => {
    setGenerating(true);
    setGenerationError('');
    try {
      const response = await apiRequest(backend, '/api/generate/materials', {
        method: 'POST',
        body: JSON.stringify({ profile, job: r.job, match: r.m }),
      });
      setDocs(response.materials);
      setSrc('nebius');
    } catch (error) {
      setGenerationError(error.message);
    } finally {
      setGenerating(false);
    }
  };
  const save = () => {
    const app = apps.find((a) => a.jobId === r.job.id);
    if (app) updateApp(app.id, { materials: docs }); else saveApp(r.job, docs);
    toast('Materials saved to tracker');
  };
  return (
    <div className="page">
      <PageHead title="Application Studio" sub="A focused writing workspace for creating, editing, copying, and saving application documents for any selected role." />
      <div className="studio">
        <Card className="studio-side">
          <div className="mono tiny muted">INTERNSHIP</div>
          <select value={r.job.id} onChange={(e) => setStudioJob(e.target.value)} aria-label="Select internship">
            {ranked.map(({ job, m }) => <option key={job.id} value={job.id}>{m.total} · {job.company} — {job.role}</option>)}
          </select>
          <div className="studio-meta"><ScoreRing value={r.m.total} size={40} /><div><div className="small"><b>{r.job.role}</b></div><div className="muted tiny">{r.job.company}</div></div></div>
          {r.job._sample && <SampleBadge />}
          <div className="sep" />
          <div className="mono tiny muted">GENERATE WITH</div>
          <button className={`gen-opt ${src === 'template' ? 'on' : ''}`} onClick={gen}><Icon name="file-text" size={15} /><div><b className="small">Grounded template</b><div className="tiny muted">Offline · deterministic · free</div></div></button>
          <label className="consent"><input type="checkbox" checked={allowNebius} onChange={(event) => setAllowNebius(event.target.checked)} /><span>I agree to send my profile and this job to Nebius for drafting.</span></label>
          <button className="gen-opt" disabled={!nebiusOk || !allowNebius || generating} onClick={genWithAI} title={!nebiusOk ? 'Configure Nebius in backend/.env first' : !allowNebius ? 'Consent is required before sending profile data' : ''}><Icon name="sparkles" size={15} /><div><b className="small">Nemotron via Nebius</b><div className="tiny muted">{generating ? 'Generating…' : !nebiusOk ? 'Not configured' : !allowNebius ? 'Consent required' : 'Draft with AI'}</div></div></button>
          <div className="sep" />
          <div className="mono tiny muted">JOB LINK</div>
          <div className="small">{IP.officialApplyUrl(r.job) ? <a href={IP.officialApplyUrl(r.job)} target="_blank" rel="noopener noreferrer">Official company application ↗</a> : r.job.sourceUrl && !r.job._sample ? <a href={r.job.sourceUrl} target="_blank" rel="noopener noreferrer">View original listing ↗</a> : <span className="muted">Not available for sample records</span>}</div>
        </Card>
        <Card pad={false} className="studio-main">
          <div className="tabs" role="tablist">{DOCS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
          {generationError && <p className="err small" role="alert" style={{ padding: '10px 16px 0' }}>{generationError}</p>}
          {docs ? (
            <>
              <div className="doc-bar"><Tag mono tone="neutral">{src === 'template' ? 'TEMPLATE DRAFT — NOT MODEL OUTPUT' : 'NEMOTRON'}</Tag><span className="muted tiny">{(docs[tab] || '').split(/\s+/).filter(Boolean).length} words</span></div>
              <textarea className="doc" value={docs[tab]} onChange={(e) => setDocs({ ...docs, [tab]: e.target.value })} aria-label={tab} />
              <div className="doc-actions">
                <Btn small icon="rotate-ccw" onClick={() => { const d = IP.drafts(r.job, profile, r.m); setDocs({ ...docs, [tab]: d[tab] }); }}>Regenerate this</Btn>
                <Btn small icon="copy" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(docs[tab]); toast('Copied'); }}>Copy</Btn>
                <Btn small kind="primary" icon="save" onClick={save}>Save to tracker</Btn>
              </div>
            </>
          ) : <Empty icon="pen-line" title="No drafts yet" body="Generate a grounded first draft, then edit it in place." action={<Btn kind="primary" icon="file-text" onClick={gen}>Generate drafts</Btn>} />}
        </Card>
      </div>
    </div>
  );
}

function ApplicationAssistant({ ctx }) {
  const {
    ranked, profile, backend, nebiusOk, tavilyOk, searchInternships, apps, saveApp, updateApp, toast, go,
    jobId, studioJob,
  } = ctx;
  const [selectedId, setSelectedId] = useState(jobId || studioJob || ranked[0]?.job.id || '');
  const [tab, setTab] = useState('cover');
  const [docs, setDocs] = useState(null);
  const [src, setSrc] = useState('template');
  const [allowNebius, setAllowNebius] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const selected = ranked.find(({ job }) => job.id === selectedId) || ranked[0];
  const job = selected?.job;
  const match = selected?.m;

  useEffect(() => {
    if (!job) return;
    const saved = apps.find((application) => application.jobId === job.id);
    setDocs(saved?.materials || null);
    setReviewed(false);
    setError('');
  }, [job?.id]);

  if (!job || !match) {
    return (
      <div className="page">
        <PageHead title="Apply with AI" sub="Prepare, review, and continue to an employer's application page." />
        <Empty icon="briefcase" title="No internships available yet" body="Discover internships first, then choose a role to prepare an application." action={<Btn kind="primary" onClick={() => go('discover')}>Discover internships</Btn>} />
      </div>
    );
  }

  const officialApplyUrl = IP.officialApplyUrl(job);
  const externalUrl = !job._sample ? (officialApplyUrl || job.sourceUrl) : '';
  let validExternalUrl = false;
  try {
    const parsedUrl = new URL(externalUrl);
    validExternalUrl = parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    validExternalUrl = false;
  }

  const makeTemplate = () => {
    setDocs(IP.drafts(job, profile, match));
    setSrc('template');
    setReviewed(false);
    setError('');
  };
  const makeNebiusDrafts = async () => {
    setGenerating(true);
    setError('');
    setReviewed(false);
    try {
      const response = await apiRequest(backend, '/api/generate/materials', {
        method: 'POST',
        body: JSON.stringify({ profile, job, match }),
      });
      setDocs(response.materials);
      setSrc('nebius');
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setGenerating(false);
    }
  };
  const findLiveListings = async () => {
    setSearching(true);
    setError('');
    try {
      const results = await searchInternships(`${job.role} internships ${job.city || ''}`.trim());
      const firstLiveJob = results.find((result) => !result._sample);
      if (!firstLiveJob) {
        setError('No live postings were returned. Try searching in Discover with a broader query.');
        return;
      }
      setSelectedId(firstLiveJob.id);
      setDocs(null);
      setReviewed(false);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setSearching(false);
    }
  };
  const saveDrafts = () => {
    const existing = apps.find((application) => application.jobId === job.id);
    if (existing) updateApp(existing.id, { materials: docs });
    else saveApp(job, docs);
    toast('Application materials saved to tracker');
  };
  const documentsReady = docs ? Object.values(docs).filter((value) => typeof value === 'string' && value.trim()).length : 0;

  return (
    <div className="page">
      <PageHead
        title="Apply with AI"
        sub="Choose a resume-matched role, prepare and review your materials, then continue on the employer's site. You submit the application yourself."
      />
      <div className="apply-notice">
        <Icon name="info" size={15} />
        <span>InternPilot does not fill or submit third-party forms. Verify the posting and attach your resume on the employer's application site. Nebius receives your profile and this job only if you explicitly choose AI drafting and agree below.</span>
      </div>
      <Card className="apply-role">
        <div className="apply-role-heading">
          <div><div className="mono tiny muted">STEP 1 · PICK A MATCHED ROLE</div><label className="sr-only" htmlFor="application-job">Select a matched internship</label></div>
          <select id="application-job" value={job.id} onChange={(event) => setSelectedId(event.target.value)}>
            {ranked.map(({ job: option, m: optionMatch }) => (
              <option key={option.id} value={option.id}>{optionMatch.total} · {option.company} — {option.role}{option._sample ? ' · SAMPLE' : ''}</option>
            ))}
          </select>
        </div>
        <div className="apply-role-summary">
          <ScoreRing value={match.total} size={48} />
          <div className="apply-role-copy"><h2>{job.role}</h2><p className="muted small">{job.company}{job.city ? ` · ${job.city}` : ''} · Estimated resume match</p></div>
          {job._sample && <SampleBadge />}
        </div>
      </Card>

      <div className="apply-layout">
        <div className="apply-steps">
          <Card className="apply-step">
            <div className="apply-step-heading"><span className="step-number">2</span><div><h2>Prepare your packet</h2><p className="muted tiny">Generate drafts for this role</p></div></div>
            <div className="apply-actions">
              <Btn small icon="file-text" onClick={makeTemplate}>Use local templates</Btn>
              <label className="consent"><input type="checkbox" checked={allowNebius} onChange={(event) => setAllowNebius(event.target.checked)} /><span>I agree to send my profile and this job to Nebius.</span></label>
              <button className="gen-opt" disabled={!nebiusOk || !allowNebius || generating} onClick={makeNebiusDrafts} title={!nebiusOk ? 'Configure Nebius in Settings & Integrations' : !allowNebius ? 'Consent is required before sending profile data' : ''}>
                <Icon name="sparkles" size={15} />
                <div><b className="small">Nemotron via Nebius</b><div className="tiny muted">{generating ? 'Generating…' : !nebiusOk ? 'Not configured — check settings' : !allowNebius ? 'Consent required' : 'Generate application packet'}</div></div>
              </button>
              {error && <p className="err small" role="alert">{error}</p>}
            </div>
          </Card>

          <Card className="apply-step">
            <div className="apply-step-heading"><span className={`step-number ${docs ? 'step-done' : ''}`}>{docs ? <Icon name="check" size={14} /> : '3'}</span><div><h2>Review your materials</h2><p className="muted tiny">{docs ? `${documentsReady} of ${DOCS.length} drafts ready · edit each one before use` : 'Generate a packet to start reviewing'}</p></div></div>
            <Btn small icon="save" onClick={saveDrafts} disabled={!docs}>Save packet to tracker</Btn>
            {validExternalUrl && docs && <label className="consent"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed the drafts and checked this {officialApplyUrl ? 'official application link' : 'original job listing'}.</span></label>}
          </Card>

          <Card className="apply-step">
            <div className="apply-step-heading"><span className={`step-number ${reviewed ? 'step-done' : ''}`}>{reviewed ? <Icon name="check" size={14} /> : '4'}</span><div><h2>{job._sample || !validExternalUrl ? 'Find a live listing' : officialApplyUrl ? 'Apply on the company site' : 'Open the original listing'}</h2><p className="muted tiny">You complete and submit the form yourself</p></div></div>
            {validExternalUrl ? (
              <a className="btn btn-primary apply-link" href={externalUrl} target="_blank" rel="noopener noreferrer"><Icon name="arrow-up-right" size={15} />{officialApplyUrl ? 'Official apply' : 'Open listing'}</a>
            ) : job._sample && tavilyOk ? (
              <Btn small kind="primary" icon="search" onClick={findLiveListings} disabled={searching}>{searching ? 'Searching live postings…' : 'Find live listings'}</Btn>
            ) : job._sample && !tavilyOk ? (
              <Btn small kind="primary" onClick={() => go('settings')}>Configure live search</Btn>
            ) : (
              <Btn small kind="primary" onClick={() => go('discover')}>Find live listings</Btn>
            )}
            {job._sample && <p className="muted tiny">{tavilyOk ? 'Sample data is fictional and cannot be opened as a real posting. Search live listings to get a working source link.' : 'Sample data is fictional. Configure Tavily live search to find real job postings and working source links.'}</p>}
            {!job._sample && !validExternalUrl && <p className="muted tiny">No usable application URL is available for this listing.</p>}
            {validExternalUrl && <p className="muted tiny">{officialApplyUrl ? 'This link matches the employer domain or a supported company-hosted hiring platform. Check the destination before sharing personal information.' : 'This opens the original search result directly; check the page for the company’s official careers link.'} Attach your resume there when requested.</p>}
          </Card>
        </div>

        <Card className="apply-packet">
          <div className="apply-packet-heading"><div><div className="mono tiny muted">APPLICATION PACKET</div><h2>Materials to review</h2></div><Tag mono>{documentsReady}/{DOCS.length} READY</Tag></div>
          <div className="apply-doc-list" role="tablist" aria-label="Application materials">
            {DOCS.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'apply-doc-option on' : 'apply-doc-option'} onClick={() => setTab(key)}>
                <span className={`apply-doc-check ${docs && docs[key]?.trim() ? 'ready' : ''}`}>{docs && docs[key]?.trim() ? <Icon name="check" size={12} /> : <Icon name="file-text" size={12} />}</span>
                <span>{label}</span><Icon name="chevron-right" size={14} />
              </button>
            ))}
          </div>
          {error && <p className="err small" role="alert">{error}</p>}
          {docs ? (
            <div className="apply-editor">
              <div className="doc-bar"><Tag mono>{src === 'nebius' ? 'NEBIUS DRAFT — REVIEW BEFORE USE' : 'LOCAL TEMPLATE — REVIEW BEFORE USE'}</Tag><span className="muted tiny">{(docs[tab] || '').split(/\s+/).filter(Boolean).length} words</span></div>
              <textarea className="doc" value={docs[tab] || ''} onChange={(event) => { setDocs({ ...docs, [tab]: event.target.value }); setReviewed(false); }} aria-label={`${DOCS.find(([key]) => key === tab)?.[1] || tab} draft`} />
              <div className="doc-actions"><Btn small icon="copy" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(docs[tab] || ''); toast('Copied'); }}>Copy selected draft</Btn></div>
            </div>
          ) : <Empty icon="file-check-2" title="Your packet will appear here" body="Choose local templates or consent to Nemotron drafting. Then review each material before continuing." />}
        </Card>
      </div>
    </div>
  );
}

function Tracker({ ctx }) {
  const { apps, updateApp, deleteApp, openJob, setStudioJob, go } = ctx;
  const [q, setQ] = useState('');
  const [st, setSt] = useState('All');
  const [sort, setSort] = useState('saved');
  const [view, setView] = useState('table');
  const list = apps.filter((a) => (st === 'All' || a.status === st) && (a.company + ' ' + a.role).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : b.savedAt.localeCompare(a.savedAt));
  if (!apps.length) return <div className="page"><PageHead title="Application tracker" /><Empty icon="kanban" title="Your tracker is empty" body="Save an internship from Discover to start tracking it here." action={<Btn kind="primary" onClick={() => go('discover')}>Find internships</Btn>} /></div>;
  return (
    <div className="page">
      <PageHead title="Application tracker" sub={`${apps.length} application${apps.length === 1 ? '' : 's'} · stored locally in this browser`} right={<div className="seg">{[['table', 'Table'], ['board', 'Board']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>} />
      <div className="filters">
        <div className="search sm"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or role" aria-label="Search applications" /></div>
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Filter by status"><option>All</option>{IP.STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="saved">Newest saved</option><option value="deadline">Deadline</option></select>
      </div>
      {view === 'table' ? (
        <Card pad={false}>
          <div className="tbl" role="table">
            <div className="tr th" role="row"><span>Company / role</span><span>Status</span><span>Saved</span><span>Applied</span><span>Deadline</span><span>Notes</span><span /></div>
            {list.map((a) => (
              <div className="tr" role="row" key={a.id}>
                <span><button className="linkish strong" onClick={() => openJob(a.jobId)}>{a.company}</button><div className="muted tiny">{a.role}{a.sample ? ' · sample' : ''}</div></span>
                <span><select className={`st-sel st-${a.status.toLowerCase()}`} value={a.status} onChange={(e) => updateApp(a.id, { status: e.target.value, appliedAt: e.target.value === 'Applied' && !a.appliedAt ? new Date().toISOString().slice(0, 10) : a.appliedAt })} aria-label="Status">{IP.STATUSES.map((s) => <option key={s}>{s}</option>)}</select></span>
                <span className="mono small">{a.savedAt.slice(0, 10)}</span>
                <span className="mono small">{a.appliedAt || '—'}</span>
                <span className="mono small">{a.deadline || '—'}</span>
                <span><input className="note-in" value={a.notes} onChange={(e) => updateApp(a.id, { notes: e.target.value })} placeholder="Add note" aria-label="Notes" /></span>
                <span className="tr-act">
                  <button className="icon-btn" title={a.materials ? 'Open saved materials' : 'Write materials'} onClick={() => { setStudioJob(a.jobId); go('studio'); }}><Icon name={a.materials ? 'file-check' : 'pen-line'} size={15} /></button>
                  <button className="icon-btn danger" title="Delete" onClick={() => { if (confirm(`Delete ${a.company} — ${a.role}? This can't be undone.`)) deleteApp(a.id); }}><Icon name="trash-2" size={15} /></button>
                </span>
              </div>
            ))}
            {!list.length && <div className="tr"><span className="muted small">No applications match these filters.</span></div>}
          </div>
        </Card>
      ) : (
        <div className="board">
          {IP.STATUSES.map((s) => (
            <div key={s} className="lane" onDragOver={(e) => e.preventDefault()} onDrop={(e) => updateApp(e.dataTransfer.getData('id'), { status: s })}>
              <div className="lane-h"><span className={`st st-${s.toLowerCase()}`}>{s}</span><span className="mono tiny muted">{list.filter((a) => a.status === s).length}</span></div>
              {list.filter((a) => a.status === s).map((a) => (
                <div key={a.id} className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData('id', a.id)} onClick={() => openJob(a.jobId)}>
                  <b className="small">{a.company}</b><div className="tiny muted">{a.role}</div>{a.deadline && <div className="mono tiny">due {a.deadline}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AGENT_TOOLS = [
  ['load_profile', 'Load candidate profile', 'local'], ['search_internships', 'Search internships', 'search'], ['extract_requirements', 'Extract job requirements', 'local'],
  ['score_matches', 'Calculate matches', 'local'], ['rank_results', 'Rank results', 'local'], ['draft_materials', 'Prepare application materials', 'local'],
];

function Assistant({ ctx }) {
  const { profile, ranked, weights, nebiusOk, tavilyOk, searchInternships, openJob, go } = ctx;
  const [task, setTask] = useState('Find LLM internships in Hyderabad that fit my profile and draft materials for the best one');
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true); setLog([]); setResult(null);
    const push = (e) => setLog((l) => [...l, e]);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    const n = IP.allSkills(profile).length;
    if (!n) { push({ ok: false, t: 'Candidate profile is empty — stopping', tool: 'load_profile' }); setRunning(false); return; }
    push({ ok: true, t: `Candidate profile loaded (${n} skills)`, tool: 'load_profile' }); await wait(250);
    let hits;
    try {
      hits = await searchInternships(task);
    } catch (error) {
      push({ ok: false, t: `Internship search failed — ${error.message}`, tool: 'search_internships' });
      setRunning(false);
      return;
    }
    push({ ok: true, t: `Internship search completed — ${hits.length} ${tavilyOk ? 'live' : 'sample'} records`, tool: 'search_internships', note: tavilyOk ? 'Tavily provider' : 'sample provider' }); await wait(250);
    push({ ok: true, t: `Job requirements extracted from ${hits.length} records`, tool: 'extract_requirements', note: 'structured fields' }); await wait(250);
    const scored = hits.map((job) => ({ job, m: IP.score(job, profile, weights) }))
      .sort((a, b) => b.m.total - a.m.total);
    push({ ok: true, t: `Candidate matches calculated`, tool: 'score_matches' }); await wait(200);
    push({ ok: true, t: `Results ranked — top score ${scored[0] ? scored[0].m.total : '—'}`, tool: 'rank_results' }); await wait(200);
    if (scored[0]) push({ ok: true, t: `Application materials prepared for ${scored[0].job.company}`, tool: 'draft_materials', note: 'template' });
    push({ ok: null, t: 'Planner / summary step skipped — Nebius not configured', tool: 'nemotron' });
    setResult({ top: scored.slice(0, 3), ms: Math.round(performance.now() - t0), steps: 6 });
    setRunning(false);
  };
  return (
    <div className="page">
      <PageHead title="AI agent" sub="A bounded, tool-using agent. Only allowlisted tools run; every event below actually happened." />
      {result && (
        <Card className="agent-results">
          <div className="card-h">
            <h2>Results</h2>
            {result.top.length && result.top.every(({ job }) => job._sample)
              ? <SampleBadge />
              : result.top.length ? <Tag tone="ok">LIVE RESULTS</Tag> : null}
            <span className="mono tiny muted">{result.steps} steps · {result.ms} ms</span>
          </div>
          {result.top.length ? result.top.map(({ job, m }) => (
            <button key={job.id} className="row" onClick={() => openJob(job.id)}>
              <ScoreRing value={m.total} size={38} />
              <div className="row-main">
                <div className="row-t">{job.role}</div>
                <div className="muted small">{job.company} · missing: {m.missingReq.join(', ') || 'none'}</div>
              </div>
              <Icon name="chevron-right" size={16} />
            </button>
          )) : <p className="muted small">No matching records.</p>}
          {result.top[0] && (
            <div className="agent-result-actions">
              <Btn small icon="pen-line" onClick={() => { ctx.setStudioJob(result.top[0].job.id); go('studio'); }}>Open drafts in Studio</Btn>
            </div>
          )}
        </Card>
      )}
      <div className="grid-2 wide-left">
        <div className="col">
          <Card>
            <label className="mono tiny muted" htmlFor="task">TASK</label>
            <textarea id="task" className="task" rows="3" value={task} onChange={(e) => setTask(e.target.value)} />
            <div className="row-inline" style={{ justifyContent: 'space-between' }}>
              <span className="tiny muted">{nebiusOk ? 'Nemotron plans tool calls · max 8 steps' : 'Demo mode: fixed deterministic pipeline, no model planning'}</span>
              <Btn kind="primary" icon={running ? 'loader' : 'play'} onClick={run} disabled={running}>{running ? 'Running…' : 'Run agent'}</Btn>
            </div>
          </Card>
          <Card>
            <div className="card-h"><h2>Activity</h2>{result && <span className="mono tiny muted">{result.steps} steps · {result.ms} ms</span>}</div>
            {log.length ? <div className="alog">{log.map((e, i) => (
              <div key={i} className="alog-r"><span className={`alog-i ${e.ok === true ? 'ok' : e.ok === false ? 'bad' : 'skip'}`}>{e.ok === true ? '✓' : e.ok === false ? '✕' : '–'}</span><span className="small">{e.t}</span><span className="mono tiny muted">{e.tool}{e.note ? ' · ' + e.note : ''}</span></div>
            ))}</div> : <p className="muted small">Run the agent to see high-level progress events. Private reasoning is never shown.</p>}
          </Card>
        </div>
        <Card>
          <div className="card-h"><h2>Allowlisted tools</h2></div>
          {AGENT_TOOLS.map(([id, label, kind]) => (
            <div key={id} className="tool"><span className="mono small">{id}</span><span className="muted tiny">{label}</span><Tag mono tone={kind === 'search' ? 'warn' : 'neutral'}>{kind === 'search' ? 'NETWORK' : 'LOCAL'}</Tag></div>
          ))}
          <div className="sep" />
          <ul className="priv small">
            <li>Arguments validated against Pydantic schemas before dispatch.</li>
            <li>No shell, file-system or form-submission tools exist.</li>
            <li>Malformed tool calls are rejected and reported, not retried blindly.</li>
            <li>Step limit configurable (<span className="mono">AGENT_MAX_STEPS</span>).</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Settings({ ctx }) {
  const { weights, setWeights, backend, setBackend, status, checkBackend } = ctx;
  const nb = status && status.nebius, tv = status && status.tavily;
  const row = (name, s, envs, where) => (
    <div className="integ">
      <div className="integ-h"><b>{name}</b>{status === null ? <Tag mono>NOT CHECKED</Tag> : status.error ? <Tag mono tone="bad">BACKEND UNREACHABLE</Tag> : s && s.ok ? <Tag mono tone="ok">CONFIGURED</Tag> : <Tag mono tone="warn">NOT CONFIGURED</Tag>}</div>
      {s && s.model && <div className="mono tiny">model: {s.model}{s.latency_ms ? ` · ${s.latency_ms} ms` : ''}</div>}
      <div className="envs">{envs.map((e) => <span key={e} className="mono tiny env">{e}=</span>)}</div>
      <div className="tiny muted">{where}</div>
    </div>
  );
  return (
    <div className="page">
      <PageHead title="Settings & integrations" sub="Configuration status is reported by the backend only. Provider keys stay on the server and never reach the browser." />
      <div className="grid-2">
        <div className="col">
          <Card>
            <div className="card-h"><h2>Backend</h2></div>
            <div className="search sm"><Icon name="server" size={14} /><input value={backend} onChange={(e) => setBackend(e.target.value)} aria-label="Backend URL" /><Btn small onClick={checkBackend}>Check status</Btn></div>
            <p className="tiny muted" style={{ marginTop: 8 }}>Checks whether the backend has provider settings; it does not test model access. Generate a draft to verify Nebius authentication and the selected model. {status && status.error ? <span className="err">{status.error}</span> : null}</p>
          </Card>
          <Card>
            {row('Nebius Token Factory · NVIDIA Nemotron', nb, ['NEBIUS_API_KEY', 'NEBIUS_BASE_URL', 'NEBIUS_MODEL'], 'Set these in backend/.env. Get the exact base URL and model ID from your Nebius account; never put keys in frontend files.')}
            {row('Tavily web search', tv, ['TAVILY_API_KEY'], 'Set this in backend/.env. Search falls back to the bundled sample data when Tavily is not configured.')}
          </Card>
          <Card>
            <div className="card-h"><h2>Cost controls</h2></div>
            <ul className="priv small">
              <li>No silent fallback to another LLM. If quota is exhausted you'll see an explicit message.</li>
              <li>Matching, ranking and templates run locally and cost nothing.</li>
              <li>No GPU instances or dedicated endpoints are ever provisioned.</li>
            </ul>
          </Card>
        </div>
        <Card>
          <div className="card-h"><h2>Match weights</h2><button className="linkish tiny" onClick={() => setWeights(IP.DEFAULT_WEIGHTS)}>Reset</button></div>
          <p className="small muted">Scores re-rank instantly. Weights are normalised, so they don't need to sum to 100.</p>
          {Object.keys(IP.DEFAULT_WEIGHTS).map((k) => (
            <label key={k} className="wt"><span className="small">{IP.FACTOR_LABELS[k]}</span><input type="range" min="0" max="50" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: +e.target.value })} /><span className="mono small">{weights[k]}</span></label>
          ))}
          <div className="sep" />
          <div className="mono tiny muted">DATA</div>
          <Btn small kind="ghost" icon="trash" onClick={() => { if (confirm('Delete all locally stored profile and tracker data?')) { localStorage.removeItem('ip_state_v1'); location.reload(); } }}>Delete all local data</Btn>
        </Card>
      </div>
    </div>
  );
}

export { ApplicationAssistant, Profile, Studio, Tracker, Assistant, Settings };
