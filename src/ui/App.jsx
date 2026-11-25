import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import logo from '../assets/osien-logo.png';
import DiveIn from './DiveIn.jsx';
import {
  ArrowDownToLine, Check, ChevronDown, Compass,
  FileImage, Film, FolderOpen, HardDrive, Image,
  LoaderCircle, Minus, Moon, Search, Smartphone,
  Sun, X
} from 'lucide-react';

const $ = (id) => document.getElementById(id);
const bytesLabel = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};
const dateLabel = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
};

function TickBox({ checked, onChange, label, disabled = false }) {
  return <Checkbox.Root className="check" checked={checked} onCheckedChange={onChange}
    aria-label={label} disabled={disabled}>
    <Checkbox.Indicator>{checked === 'indeterminate' ? <Minus size={13} /> : <Check size={13} />}</Checkbox.Indicator>
  </Checkbox.Root>;
}

function WindowControls() {
  return <div className="window-controls">
    <button aria-label="Minimize window" onClick={() => window.aplet.windowAction('minimize')}><Minus size={15} /></button>
    <button aria-label="Maximize window" onClick={() => window.aplet.windowAction('toggle-maximize')}><span className="maximize-glyph" /></button>
    <button className="close-window" aria-label="Close window" onClick={() => window.aplet.windowAction('close')}><X size={15} /></button>
  </div>;
}

function LibrarySkeleton() {
  return <div className="skeleton-library" aria-label="Loading media library" aria-busy="true">
    <div className="skeleton-date"><span className="skeleton skeleton-date-title" /><span className="skeleton skeleton-date-count" /></div>
    {Array.from({ length: 5 }, (_, index) => <div className="skeleton-row" key={index}>
      <span className="skeleton skeleton-check" />
      <span className="skeleton skeleton-thumbnail" />
      <span className="skeleton-copy"><i className="skeleton skeleton-name" /><i className="skeleton skeleton-subtitle" /></span>
      <span className="skeleton skeleton-size" />
    </div>)}
    <p><LoaderCircle size={14} className="spin" /> Finding media…</p>
  </div>;
}

export default function App() {
  const [page, setPage] = useState('memories');
  const [files, setFiles] = useState([]);
  const [displayLimit, setDisplayLimit] = useState(250);
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [organizeByDate, setOrganizeByDate] = useState(() => localStorage.getItem('aplet-organize-by-date') === 'true');
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(null);
  const [device, setDevice] = useState({ state: 'checking', message: 'Looking for your iPhone…' });
  const [progress, setProgress] = useState(null);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('aplet-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });
  const scanStarted = useRef(0);
  const pendingScanFiles = useRef([]);
  const scanFlushTimer = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('aplet-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('aplet-organize-by-date', String(organizeByDate));
  }, [organizeByDate]);

  useEffect(() => {
    const flushScanFiles = () => {
      scanFlushTimer.current = null;
      if (!pendingScanFiles.current.length) return;
      const batch = pendingScanFiles.current;
      pendingScanFiles.current = [];
      setFiles(old => [...old, ...batch]);
    };
    const stopScanProgress = window.aplet.onScanProgress(({ found, elapsedMs, files: discovered = [] }) => {
      const seconds = Math.max(.25, (elapsedMs || Date.now() - scanStarted.current) / 1000);
      const rate = found ? Math.round(found / seconds) : 0;
      if (discovered.length) {
        pendingScanFiles.current.push(...discovered);
        if (!scanFlushTimer.current) {
          scanFlushTimer.current = setTimeout(flushScanFiles, 400);
        }
      }
      setProgress({
        kind: 'scan', found, rate,
        label: 'Scanning iPhone',
         detail: `${found.toLocaleString()} found${rate ? ` · ${rate.toLocaleString()} per sec` : ''}`
      });
    });
    const stopPhoneProgress = window.aplet.onPhoneProgress((p) => {
      const percent = p.currentTotalBytes > 0
        ? Math.min(100, Math.floor((p.currentBytes / p.currentTotalBytes) * 100)) : null;
      const title = p.phase === 'saving' ? `Organizing ${p.name}`
        : p.phase === 'saved' ? `Saved ${p.name}`
          : `Copying ${p.name} · file ${Math.min(p.completed + 1, p.total)} of ${p.total}`;
      const detail = `${bytesLabel(p.bytes)} transferred in total${p.currentTotalBytes > 0
        ? ` · ${bytesLabel(p.currentBytes)} of ${bytesLabel(p.currentTotalBytes)} for this file` : ''} · ${p.completed} of ${p.total} organized`;
      setProgress({ kind: 'import', value: percent, indeterminate: p.phase === 'transfer' && percent === null,
        completed: p.completed, total: p.total, label: title, detail });
    });
    const stopLocalProgress = window.aplet.onLocalProgress(({ completed, total }) => setProgress({ kind: 'import', value: total ? Math.floor(completed / total * 100) : 0, completed, total, label: 'Organizing files', detail: `${completed} of ${total} files processed` }));
    checkDevice().catch(() => setDevice({
      state: 'error', message: 'Connection check failed. Try again.'
    }));
    return () => {
      if (scanFlushTimer.current) {
        clearTimeout(scanFlushTimer.current);
        scanFlushTimer.current = null;
      }
      pendingScanFiles.current = [];
      stopScanProgress();
      stopPhoneProgress();
      stopLocalProgress();
    };
  }, []);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('library-search')?.focus();
      }
      if (event.key === 'Escape' && query) setQuery('');
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [query]);

  const visible = useMemo(() => files.filter((file) =>
    (filter === 'all' || file.type === filter) &&
    file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ).sort((a, b) => {
    if (a.date === 'Unknown-date' && b.date !== 'Unknown-date') return 1;
    if (b.date === 'Unknown-date' && a.date !== 'Unknown-date') return -1;
    const dateOrder = sortOrder === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    return dateOrder || a.name.localeCompare(b.name);
  }), [files, filter, query, sortOrder]);
  const groups = useMemo(() => {
    const result = new Map();
    for (const file of visible) {
      if (!result.has(file.date)) result.set(file.date, []);
      result.get(file.date).push(file);
    }
    return [...result.entries()];
  }, [visible]);
  const displayedGroups = useMemo(() => {
    let remaining = displayLimit;
    const displayed = [];
    for (const [date, group] of groups) {
      if (remaining <= 0) break;
      const rows = group.slice(0, remaining);
      displayed.push([date, group, rows]);
      remaining -= rows.length;
    }
    return displayed;
  }, [groups, displayLimit]);
  const counts = {
    all: files.length,
    Photos: files.filter(file => file.type === 'Photos').length,
    Videos: files.filter(file => file.type === 'Videos').length
  };
  const allVisibleSelected = visible.length > 0 && visible.every(file => selected.has(file.id));
  const someVisibleSelected = visible.some(file => selected.has(file.id));
  const activeStatus = operation === 'scanPhone'
    ? `Scanning iPhone · ${files.length.toLocaleString()} found`
    : operation === 'scanFolder'
      ? 'Scanning folder…'
      : operation === 'import'
        ? `Importing files · ${progress?.completed || 0} of ${progress?.total || selected.size}`
        : device.message;
  async function checkDevice() {
    setDevice({ state: 'checking', message: 'Looking for your iPhone…' });
    try {
      const result = await window.aplet.detectAppleDevice();
      if (!result.supported) setDevice({ state: 'error', message: 'iPhone import is available on Windows.' });
      else if (result.error) setDevice({ state: 'error', message: result.error });
      else if (!result.devices.length) setDevice({ state: 'error', message: 'No iPhone detected. Unlock it and tap Trust This Computer.' });
      else if (result.devices[0].status.toLowerCase() !== 'ok') setDevice({ state: 'error', message: `iPhone needs attention · ${result.devices[0].status}` });
      else setDevice({ state: 'connected', message: 'iPhone connected and ready' });
    } catch {
      setDevice({ state: 'error', message: 'Could not check the iPhone connection.' });
    }
  }

  async function scanPhone() {
    if (busy) return;
    if (scanFlushTimer.current) {
      clearTimeout(scanFlushTimer.current);
      scanFlushTimer.current = null;
    }
    pendingScanFiles.current = [];
    setBusy(true); setSource(null); setFiles([]); setSelected(new Set()); setDisplayLimit(250);
    setOperation('scanPhone');
    scanStarted.current = Date.now();
    setProgress({ kind: 'scan', found: 0, label: 'Connecting to iPhone', detail: 'Keep your iPhone unlocked and connected.' });
    try {
      const result = await window.aplet.scanPhone();
      if (scanFlushTimer.current) {
        clearTimeout(scanFlushTimer.current);
        scanFlushTimer.current = null;
      }
      pendingScanFiles.current = [];
      setSource('iphone'); setFiles(result.files); setSelected(new Set());
      const skipped = result.errors?.length || 0;
      if (skipped) setProgress({ kind: 'error', label: 'Some folders could not be read',
        detail: `${result.files.length.toLocaleString()} media files found · ${skipped} folders skipped` });
      else if (!result.files.length) setProgress({ kind: 'error', label: 'No media found',
        detail: 'Keep your iPhone unlocked and make sure its photos are stored on the device.' });
      else setProgress(null);
      setDevice({ state: 'connected', message: 'iPhone connected and ready' });
    } catch (error) {
      setFiles([]); setSelected(new Set()); setSource(null);
      setProgress({ kind: 'error', label: 'Could not scan iPhone', detail: error.message });
      setDevice({ state: 'error', message: 'iPhone disconnected or unavailable' });
    } finally { setBusy(false); setOperation(null); }
  }

  async function scanFolder() {
    if (busy) return;
    const folder = await window.aplet.chooseFolder('Choose a folder with photos and videos');
    if (!folder) return;
    setBusy(true); setOperation('scanFolder');
    setProgress({ kind: 'scan', found: 0, label: 'Scanning folder', detail: 'Finding photos and videos…' });
    try {
      const result = await window.aplet.scanMedia(folder);
      setSource(folder); setFiles(result.files); setSelected(new Set()); setDisplayLimit(250);
      setProgress(result.files.length ? null : { kind: 'error', label: 'No media found',
        detail: 'Choose a folder containing supported photos or videos.' });
    } catch (error) { setProgress({ kind: 'error', label: 'Folder scan failed', detail: error.message }); }
    finally { setBusy(false); setOperation(null); }
  }

  async function chooseDestination() {
    const folder = await window.aplet.chooseFolder('Choose where to save your media');
    if (folder) setDestination(folder);
  }

  function selectGroup(group, checked) {
    setSelected(old => {
      const next = new Set(old);
      for (const file of group) checked ? next.add(file.id) : next.delete(file.id);
      return next;
    });
  }

  async function importSelected() {
    if (busy || selected.size === 0 || !destination) return;
    const chosen = files.filter(file => selected.has(file.id));
    if (!chosen.length) {
      setProgress({ kind: 'error', label: 'Nothing to import', detail: 'Select media from the current library and try again.' });
      setSelected(new Set());
      return;
    }
    setBusy(true); setOperation('import'); setProgress({ kind: 'import', indeterminate: true, label: 'Starting import', detail: `Preparing ${chosen.length.toLocaleString()} selected files…` });
    try {
      const layout = organizeByDate ? 'organized' : 'flat';
      const results = source === 'iphone'
        ? await window.aplet.importPhone({ destination, ids: chosen.map(file => file.id), layout })
        : await window.aplet.importMedia({ source, destination, files: chosen, layout });
      if (!Array.isArray(results) || !results.length) {
        throw new Error('No files were saved. Read the iPhone or folder again, then retry.');
      }
      const copied = results.filter(item => item.ok);
      const failed = chosen.length - copied.length;
      const summary = {
        photos: copied.filter(item => item.type === 'Photos').length,
        videos: copied.filter(item => item.type === 'Videos').length
      };
      setSelected(old => {
        const next = new Set(old);
        if (source === 'iphone') copied.forEach(item => next.delete(item.id));
        else if (!failed) next.clear();
        return next;
      });
      const firstError = results.find(item => !item.ok)?.error;
      setProgress({ kind: failed ? 'error' : 'complete', value: 100,
        label: failed ? 'Import needs attention' : 'Import complete',
        detail: `${summary.photos} photos and ${summary.videos} videos saved ${organizeByDate ? 'in date folders under' : 'directly to'} ${destination}${failed ? ` · ${failed} not saved${firstError ? ` · ${firstError}` : ''}` : ''}` });
    } catch (error) {
      setProgress({ kind: 'error', label: 'Import stopped', detail: error.message });
    } finally { setBusy(false); setOperation(null); }
  }

  function toggleAll(checked) {
    setSelected(old => {
      const next = new Set(old);
      for (const file of visible) checked ? next.add(file.id) : next.delete(file.id);
      return next;
    });
  }

  const sourceButtons = <div className="hero-actions">
    <button className="button primary" onClick={scanPhone} disabled={busy}>
      {operation === 'scanPhone' ? <LoaderCircle className="spin" size={17} /> : <Smartphone size={17} />}
      {operation === 'scanPhone' ? 'Reading iPhone' : 'Read iPhone'}
    </button>
    <button className="button secondary" onClick={scanFolder} disabled={busy}>
      <FolderOpen size={17} /> Open a folder
    </button>
  </div>;

  return <div className="window-shell">
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="brand-mark"><img src={logo} alt="" /></span>
        <span>OSIEN <strong>Memories</strong></span>
      </div>
      <nav className="titlebar-nav" aria-label="App pages">
        <button
          type="button"
          className={`nav-pill ${page === 'memories' ? 'active' : ''}`}
          onClick={() => setPage('memories')}
        >
          Memories
        </button>
        <button
          type="button"
          className={`nav-pill ${page === 'dive-in' ? 'active' : ''}`}
          onClick={() => setPage('dive-in')}
        >
          <Compass size={13} /> Dive in
        </button>
      </nav>
      <div className="titlebar-drag" onDoubleClick={() => window.aplet.windowAction('toggle-maximize')} />
      <button className="title-icon" aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <WindowControls />
    </header>

    {page === 'dive-in' ? (
      <main className="app-main dive-main">
        <DiveIn />
      </main>
    ) : (
      <>
    <main className="app-main">
      {source ? <div className="loaded-toolbar">
        <div className="loaded-source">
          <span className="section-kicker">CURRENT SOURCE</span>
          <button className={`device-status ${device.state}`} onClick={checkDevice} disabled={busy} title="Check iPhone connection">
            <span className="status-dot" /><span>{source === 'iphone' ? activeStatus : 'Local folder loaded'}</span>
          </button>
        </div>
        {sourceButtons}
      </div> : <>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> PRIVATE MEDIA STUDIO</span>
            <h1>Your memories, <em>beautifully kept.</em></h1>
            <p>Bring photos and videos from your iPhone or a folder into one organized place.</p>
          </div>
          {sourceButtons}
        </section>
        <div className="context-row">
          <button className={`device-status ${device.state}`} onClick={checkDevice} disabled={busy} title="Check iPhone connection">
            <span className="status-dot" /><span>{activeStatus}</span>
          </button>
          <span className="context-note">Files stay on this PC</span>
        </div>
      </>}

      {progress && <section className={`progress-panel ${progress.kind}`} aria-live="polite">
        <span className="progress-symbol">
          {busy ? <LoaderCircle className="spin" size={19} /> : progress.kind === 'error' ? <X size={18} /> : <Check size={18} />}
        </span>
        <div className="progress-body">
          <div className="progress-heading">
            <strong>{progress.label}</strong>
            {progress.kind === 'scan' && <span>{files.length.toLocaleString()} found</span>}
            {progress.kind === 'import' && Number.isFinite(progress.value) && <span>{progress.value}%</span>}
          </div>
          <p>{progress.detail}</p>
          {progress.kind === 'import' && <div className={`progress-track ${progress.value === null || progress.value === undefined ? 'indeterminate' : ''}`}>
            <span style={progress.value === null || progress.value === undefined ? undefined : { width: `${progress.value}%` }} />
          </div>}
        </div>
        {!busy && <button className="dismiss-button" aria-label="Dismiss status" onClick={() => setProgress(null)}><X size={15} /></button>}
      </section>}

      <section className="library-panel" aria-label="Media library">
        <div className="library-header">
          <div className="library-title">
            <span className="section-kicker">COLLECTION</span>
            <h2>Library <span>{files.length.toLocaleString()}</span></h2>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input id="library-search" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Search files" aria-label="Search files" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
          </label>
        </div>

        <div className="library-toolbar">
          <div className="segmented" role="tablist" aria-label="Media type">
            {[['all', 'All'], ['Photos', 'Photos'], ['Videos', 'Videos']].map(([key, label]) =>
              <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}>{label}<span>{counts[key].toLocaleString()}</span></button>)}
          </div>
          <div className="toolbar-actions">
            <div className="text-action">
              <TickBox checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                onChange={toggleAll} label="Select all visible media" disabled={busy || !visible.length} />
              <button onClick={() => toggleAll(!allVisibleSelected)} disabled={busy || !visible.length}>
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <span className="toolbar-divider" />
            <button className="text-action" onClick={() => setSortOrder(old => old === 'newest' ? 'oldest' : 'newest')}
              aria-label="Change sort order">{sortOrder === 'newest' ? 'Newest' : 'Oldest'} <ChevronDown size={14} /></button>
          </div>
        </div>

        <div className="media-list">
          {!files.length && busy ? <LibrarySkeleton /> : !files.length ?
            <div className="empty-state">
              <div className="empty-icon"><Image size={28} /></div>
              <h3>No media loaded yet</h3>
              <p>Connect an unlocked iPhone or open a folder to begin.</p>
            </div> :
          !visible.length ?
            <div className="empty-state compact">
              <div className="empty-icon"><Search size={24} /></div>
              <h3>No matches</h3>
              <p>Try another search or media type.</p>
            </div> :
            <div className="media-groups">
              {displayedGroups.map(([date, group, rows]) => {
                const checkedCount = group.filter(file => selected.has(file.id)).length;
                const checked = checkedCount === group.length ? true : checkedCount ? 'indeterminate' : false;
                return <article className="date-section" key={date}>
                  <header className="date-heading">
                    <TickBox checked={checked} onChange={value => selectGroup(group, value === true)}
                      label={`Select all media from ${date}`} disabled={busy} />
                    <h3>{date === 'Unknown-date' ? 'Date unavailable' : dateLabel(date)}</h3>
                    <span>{group.length.toLocaleString()} {group.length === 1 ? 'file' : 'files'}</span>
                  </header>
                  <div className="media-rows">
                    {rows.map(file => <div className={`media-row ${selected.has(file.id) ? 'selected' : ''}`} key={file.id}>
                      <TickBox checked={selected.has(file.id)}
                        onChange={value => setSelected(old => { const next = new Set(old); value ? next.add(file.id) : next.delete(file.id); return next; })}
                        label={`Select ${file.name}`} disabled={busy} />
                      <span className={`file-icon ${file.type === 'Videos' ? 'video' : ''}`}>
                        {file.type === 'Videos' ? <Film size={18} /> : <FileImage size={18} />}
                      </span>
                      <div className="file-copy"><strong title={file.name}>{file.name}</strong><span>{file.type === 'Videos' ? 'Video' : 'Photo'} · {file.dateSource || 'Media file'}</span></div>
                      <span className="file-size">{file.size > 0 ? bytesLabel(file.size) : 'On import'}</span>
                    </div>)}
                  </div>
                </article>;
              })}
              {visible.length > displayLimit && <button className="show-more" onClick={() => setDisplayLimit(limit => limit + 250)}>
                Show more <span>{Math.min(displayLimit, visible.length).toLocaleString()} of {visible.length.toLocaleString()}</span>
              </button>}
            </div>}
        </div>
      </section>
    </main>

    <footer className="action-dock">
      <div className="selection-summary"><strong>{selected.size.toLocaleString()}</strong><span>{selected.size === 1 ? 'file selected' : 'files selected'}</span></div>
      <div className="save-settings">
        <button className="destination-control" onClick={chooseDestination} title={destination || 'Choose save location'}>
          <span className="destination-icon"><HardDrive size={17} /></span>
          <span><small>{organizeByDate ? 'ORGANIZE UNDER' : 'SAVE DIRECTLY TO'}</small><strong>{destination || 'Choose a destination'}</strong></span>
          <ChevronDown size={15} />
        </button>
        <button className="layout-choice" type="button" aria-pressed={organizeByDate}
          onClick={() => setOrganizeByDate(value => !value)}>
          <span className={`layout-check ${organizeByDate ? 'on' : ''}`}>{organizeByDate && <Check size={10} />}</span>
          Organize into type and date folders
        </button>
      </div>
      {destination && <button className="open-destination" aria-label="Open save location" title="Open save location"
        onClick={async () => { const error = await window.aplet.openFolder(destination); if (error) setProgress({ kind: 'error', label: 'Could not open folder', detail: error }); }}>
        <FolderOpen size={17} />
      </button>}
      <button className="button import-button" disabled={busy || !selected.size}
        onClick={destination ? importSelected : chooseDestination}>
        {operation === 'import' ? <LoaderCircle className="spin" size={17} /> : <ArrowDownToLine size={17} />}
        {operation === 'import' ? 'Importing' : !destination ? 'Choose save location' : `Import ${selected.size.toLocaleString()}`}
      </button>
    </footer>
      </>
    )}
  </div>;
}
