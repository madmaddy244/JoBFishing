import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import IP from './ip-data.js';
import { Shell, Toast } from './ip-ui.jsx';
import { Dashboard, Details, Discover } from './ip-pages1.jsx';
import { ApplicationAssistant, Assistant, Profile, Settings, Studio, Tracker } from './ip-pages2.jsx';
import { apiRequest } from './api.js';

const KEY = 'ip_state_v1';
const DEFAULT_BACKEND = 'http://127.0.0.1:8000';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function App() {
  const init = useMemo(load, []);
  const [route, setRoute] = useState(init.route || 'dashboard');
  const [jobId, setJobId] = useState(init.jobId || null);
  const [studioJob, setStudioJob] = useState(init.studioJob || null);
  const [profile, setProfile] = useState(init.profile || IP.SAMPLE_PROFILE);
  const [apps, setApps] = useState(init.apps || []);
  const [weights, setWeights] = useState(init.weights || IP.DEFAULT_WEIGHTS);
  const [backend, setBackend] = useState(
    init.backend === 'http://localhost:8000' ? DEFAULT_BACKEND : init.backend || DEFAULT_BACKEND,
  );
  const [status, setStatus] = useState(null);
  const [liveJobs, setLiveJobs] = useState(Array.isArray(init.liveJobs) ? init.liveJobs : []);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ route, jobId, studioJob, profile, apps, weights, backend, liveJobs }));
  }, [route, jobId, studioJob, profile, apps, weights, backend, liveJobs]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, jobId]);
  useEffect(() => {
    checkBackend();
  }, []);

  const toast = (message) => {
    setToastMsg(message);
    clearTimeout(window.__t);
    window.__t = setTimeout(() => setToastMsg(''), 1800);
  };
  const ranked = useMemo(() => {
    const jobs = [...IP.SAMPLE_JOBS, ...liveJobs];
    return jobs.map((job) => ({ job, m: IP.score(job, profile, weights) }))
      .sort((a, b) => b.m.total - a.m.total);
  }, [liveJobs, profile, weights]);
  const go = (nextRoute) => setRoute(nextRoute);
  const openJob = (id) => {
    setJobId(id);
    setRoute('details');
  };
  const saveApp = (job, materials = null) => {
    if (apps.some((app) => app.jobId === job.id)) return;
    setApps((items) => [{
      id: 'a' + Date.now(),
      jobId: job.id,
      company: job.company,
      role: job.role,
      sourceUrl: job.sourceUrl,
      applyUrl: job.applyUrl,
      deadline: job.deadline,
      savedAt: new Date().toISOString(),
      appliedAt: null,
      status: 'Saved',
      notes: '',
      materials,
      sample: !!job._sample,
    }, ...items]);
    toast(`Saved ${job.company} to tracker`);
  };
  const updateApp = (id, patch) => setApps((items) => items.map((app) => (app.id === id ? { ...app, ...patch } : app)));
  const deleteApp = (id) => {
    setApps((items) => items.filter((app) => app.id !== id));
    toast('Application deleted');
  };
  const checkBackend = async () => {
    try {
      setStatus(await apiRequest(backend, '/api/integrations/status', { timeoutMs: 4000 }));
    } catch (error) {
      setStatus({ error: error.message });
    }
  };
  const searchInternships = async (query) => {
    if (!tavilyOk) return IP.search(query);
    const response = await apiRequest(backend, '/api/search', {
      method: 'POST',
      body: JSON.stringify({ query: query.trim() || 'internship openings', max_results: 10 }),
    });
    if (!Array.isArray(response.results)) throw new Error('Backend returned an invalid search response.');
    setLiveJobs(response.results);
    return response.results;
  };
  const nebiusOk = !!(status && status.nebius && status.nebius.ok);
  const tavilyOk = !!(status && status.tavily && status.tavily.ok);
  const ctx = {
    route, go, jobId, openJob, studioJob, setStudioJob, profile, setProfile, apps, saveApp,
    updateApp, deleteApp, ranked, weights, setWeights, backend, setBackend, status,
    checkBackend, searchInternships, nebiusOk, tavilyOk, toast,
  };
  const Page = {
    dashboard: Dashboard,
    discover: Discover,
    details: Details,
    profile: Profile,
    studio: Studio,
    apply: ApplicationAssistant,
    tracker: Tracker,
    assistant: Assistant,
    settings: Settings,
  }[route] || Dashboard;

  return (
    <Shell route={route} go={go} appsCount={apps.length} nebiusOk={nebiusOk}>
      <div key={route + (jobId || '')} data-screen-label={route}><Page ctx={ctx} /></div>
      <Toast msg={toastMsg} />
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(<App />);
