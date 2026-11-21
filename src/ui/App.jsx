import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import logo from '../assets/osien-logo.png';
import {
  ArrowDownToLine, ArrowUpRight, Check, CheckCheck, ChevronDown,
  FileImage, Film, FolderOpen, HardDrive, Image,
  LoaderCircle, Minus, Moon, MoreHorizontal, Search, ShieldCheck, Smartphone,
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
    <p><LoaderCircle size={14} className="spin" /> Discovering iPhone media…</p>
  </div>;
}

export default function App() {
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState({ state: 'checking', message: 'Looking for your iPhone…' });
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState('Ready when you are');
  const [hasImported, setHasImported] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('aplet-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });
  const scanStarted = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('aplet-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.aplet.onScanProgress(({ found, elapsedMs }) => {
      const seconds = Math.max(.25, (elapsedMs || Date.now() - scanStarted.current) / 1000);
      const rate = found ? Math.round(found / seconds) : 0;
      setProgress({ indeterminate: true, label: `Scanning · ${found.toLocaleString()} found${rate ? ` · ${rate.toLocaleString()} files/sec` : ''}`, detail: 'Total library size is not known until the scan finishes.' });
    });
    window.aplet.onPhoneProgress((p) => {
      const percent = p.currentTotalBytes > 0
        ? Math.min(100, Math.floor((p.currentBytes / p.currentTotalBytes) * 100)) : null;
      const title = p.phase === 'saving' ? `Organizing ${p.name}`
        : p.phase === 'saved' ? `Saved ${p.name}`
          : `Copying ${p.name} · file ${Math.min(p.completed + 1, p.total)} of ${p.total}`;
      const detail = `${bytesLabel(p.bytes)} transferred in total${p.currentTotalBytes > 0
        ? ` · ${bytesLabel(p.currentBytes)} of ${bytesLabel(p.currentTotalBytes)} for this file` : ''} · ${p.completed} of ${p.total} organized`;
      setProgress({ value: percent, indeterminate: p.phase === 'transfer' && percent == null, label: title, detail });
    });
    window.aplet.onLocalProgress(({ completed, total }) => setProgress({ value: total ? Math.floor(completed / total * 100) : 0, label: 'Organizing files', detail: `${completed} of ${total} files processed` }));
    checkDevice().catch(() => setDevice({
      state: 'error', message: 'Connection check failed. Try again.'
    }));
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
  ).sort((a, b) => (a.date === 'Unknown-date' ? 1 : b.date === 'Unknown-date' ? -1 : b.date.localeCompare(a.date)) || a.name.localeCompare(b.name)),
  [files, filter, query]);
  const groups = useMemo(() => {
    const result = new Map();
    for (const file of visible) {
      if (!result.has(file.date)) result.set(file.date, []);
      result.get(file.date).push(file);
    }
    return [...result.entries()];
  }, [visible]);
  const counts = {
    all: files.length,
    Photos: files.filter(file => file.type === 'Photos').length,
    Videos: files.filter(file => file.type === 'Videos').length
  };
  const allVisibleSelected = visible.length > 0 && visible.every(file => selected.has(file.id));
  const someVisibleSelected = visible.some(file => selected.has(file.id));
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
    setBusy(true); setSource(null); setFiles([]); setSelected(new Set());
    scanStarted.current = Date.now();
    setProgress({ indeterminate: true, label: 'Opening iPhone storage', detail: 'Keep the phone unlocked and connected.' });
    setNotice('Connecting to iPhone…');
    try {
      const result = await window.aplet.scanPhone();
      setSource('iphone'); setFiles(result.files); setSelected(new Set());
      setProgress({ value: 100, label: 'Library scan complete', detail: `${result.files.length.toLocaleString()} media files · ${result.errors.length} folder errors` });
      setNotice(result.files.length ? `${result.files.length.toLocaleString()} items are ready to review` : 'No accessible media. Unlock the phone and allow photo access.');
      setDevice({ state: 'connected', message: `${result.device} · connected` });
    } catch (error) {
      setProgress(null); setNotice(error.message);
    } finally { setBusy(false); }
  }

  async function scanFolder() {
    if (busy) return;
    const folder = await window.aplet.chooseFolder('Choose a folder with photos and videos');
    if (!folder) return;
    setBusy(true); setProgress({ indeterminate: true, label: 'Scanning folder', detail: 'Finding photos and videos…' });
    try {
      const result = await window.aplet.scanMedia(folder);
      setSource(folder); setFiles(result.files); setSelected(new Set());
      setProgress({ value: 100, label: 'Folder scan complete', detail: `${result.files.length.toLocaleString()} media files found` });
      setNotice(`${result.files.length.toLocaleString()} items are ready to review`);
    } catch (error) { setProgress(null); setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function chooseDestination() {
    const folder = await window.aplet.chooseFolder('Choose where to save your media');
    if (folder) { setDestination(folder); setNotice(`Saving to ${folder}`); }
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
    setBusy(true); setProgress({ indeterminate: true, label: 'Preparing import', detail: `Checking ${chosen.length} selected files…` });
    setNotice(`Importing ${chosen.length.toLocaleString()} files…`);
    try {
      const results = source === 'iphone'
        ? await window.aplet.importPhone({ destination, ids: chosen.map(file => file.id) })
        : await window.aplet.importMedia({ source, destination, files: chosen });
      const copied = results.filter(item => item.ok);
      const failed = results.length - copied.length;
      if (copied.length) setHasImported(true);
      setSelected(old => {
        const next = new Set(old);
        if (source === 'iphone') copied.forEach(item => next.delete(item.id));
        else if (!failed) next.clear();
        return next;
      });
      setNotice(failed ? `${copied.length} imported · ${failed} not imported. ${results.find(item => !item.ok)?.error || ''}` : `${copied.length.toLocaleString()} files imported successfully`);
      setProgress({ value: 100, label: failed ? 'Import needs attention' : 'Import complete', detail: `${copied.length} saved${failed ? ` · ${failed} failed` : ''}` });
    } catch (error) {
      setNotice(error.message);
      setProgress({ indeterminate: true, label: 'Import stopped', detail: error.message });
    } finally { setBusy(false); }
  }

  function toggleAll(checked) {
    setSelected(old => {
      const next = new Set(old);
      for (const file of visible) checked ? next.add(file.id) : next.delete(file.id);
      return next;
    });
  }

  return <div className="window-shell">
    <header className="titlebar">
      <div className="titlebar-brand"><span className="mini-mark"><img src={logo} alt="" /></span><span>OSIEN<span className="brand-hyphen">·</span>Aplet</span><span className="titlebar-divider" /><span className="titlebar-context">Media Studio</span></div>
      <div className="drag-region" onDoubleClick={() => window.aplet.windowAction('toggle-maximize')} />
      <WindowControls />
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-orb"><img src={logo} alt="OSIEN logo" /></span><div><strong>OSIEN</strong><span>MEDIA STUDIO</span></div></div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active"><Image size={17} /><span>Library</span><span className="nav-count">{files.length || '—'}</span></button>
        <div className="sidebar-label device-label">YOUR DEVICE</div>
        <div className={`device-card ${device.state}`}>
          <div className="device-icon"><Smartphone size={18} /></div>
          <div className="device-copy"><strong>Apple iPhone</strong><span><i />{busy ? 'Reading media…' : device.message}</span></div>
          <button className="icon-button tiny" title="Check connection" onClick={checkDevice} disabled={busy}><MoreHorizontal size={17} /></button>
        </div>
        <div className="sidebar-note"><ShieldCheck size={16} /><span>Private by design<br /><b>Your files never leave this PC.</b></span></div>
        <div className="sidebar-bottom"><button className="nav-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span></button><span className="version-label">OSIEN-Aplet · 0.0.1</span></div>
      </aside>

      <main className="main-panel">
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span /> YOUR MEMORIES, ORGANIZED</div><h1>Bring it all<br /><em>into focus.</em></h1><p>Safely bring photos and videos from your iPhone to your PC.</p>
            <div className="hero-actions"><button className="button primary" onClick={scanPhone} disabled={busy}><Smartphone size={16} />{busy ? 'Working…' : 'Read iPhone'}<ArrowDownToLine size={15} /></button><button className="button ghost" onClick={scanFolder} disabled={busy}><FolderOpen size={16} /> Open a folder</button></div>
            <div className={`device-status ${device.state}`}><span className="status-dot" />{busy ? 'Reading your library · keep iPhone unlocked' : device.message}<button onClick={checkDevice} disabled={busy}>Check</button></div>
          </div>
          <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-glow" /><div className="photo-card card-back"><Film size={18} /><span>VIDEO</span></div><div className="photo-card card-front"><div className="photo-sky" /><div className="photo-sun" /><div className="photo-hill hill-a" /><div className="photo-hill hill-b" /><div className="photo-caption"><span>RECENT MOMENTS</span><b>Captured, kept.</b></div></div><div className="art-sparkle sparkle-a">✦</div><div className="art-sparkle sparkle-b">✧</div></div>
        </section>

        {progress && <section className={`progress-card ${progress.indeterminate ? 'is-indeterminate' : ''}`} aria-live="polite">
          <div className="progress-icon">{busy ? <LoaderCircle className="spin" size={17} /> : <CheckCheck size={17} />}</div>
          <div className="progress-content"><div className="progress-top"><strong>{progress.label}</strong><span>{progress.value == null ? 'LIVE' : `${progress.value}%`}</span></div><progress className="progress-track" max="100" value={progress.value == null ? undefined : progress.value} aria-label={progress.label} /><small>{progress.detail}</small></div>
        </section>}

        <section className="library-heading">
          <div><div className="section-kicker">YOUR COLLECTION</div><h2>Media library <span>{files.length.toLocaleString()}</span></h2></div>
          <button className="button destination-button" onClick={chooseDestination}><HardDrive size={16} /><span>{destination ? 'Change save location' : 'Choose save location'}</span><ArrowUpRight size={14} /></button>
        </section>
        {destination && <div className="destination-path"><FolderOpen size={13} /><span title={destination}>{destination}</span><Check size={13} /></div>}

        <section className="collection-toolbar">
          <div className="filter-tabs" role="tablist">{[['all','Everything',Image],['Photos','Photos',FileImage],['Videos','Videos',Film]].map(([key,label,Icon]) => <button role="tab" aria-selected={filter===key} className={filter===key?'selected':''} key={key} onClick={() => setFilter(key)}><Icon size={14} />{label}<span>{counts[key]}</span></button>)}</div>
          <label className="search-box"><Search size={15} /><input id="library-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your library" /><kbd>Ctrl K</kbd></label>
        </section>
        <div className="selection-toolbar"><div className="selection-toggle"><TickBox checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false} onChange={toggleAll} label="Select all visible media" disabled={busy || !visible.length} /><button onClick={() => toggleAll(!allVisibleSelected)} disabled={busy || !visible.length}>{allVisibleSelected ? 'Deselect all' : 'Select all'}</button><span>·</span><span>{selected.size.toLocaleString()} selected</span></div><span className="sort-label">Newest first <ChevronDown size={13} /></span></div>

        <section className="media-list" aria-label="Media files">
          {!files.length && busy ? <LibrarySkeleton /> : !files.length ? <div className="empty-library"><div className="empty-art"><Image size={28} /></div><h3>Your library starts here</h3><p>Connect your iPhone and read its media, or open a folder from this PC.</p><button className="button primary" onClick={scanPhone} disabled={busy}><Smartphone size={15} /> Read iPhone</button></div> :
          !visible.length ? <div className="empty-library compact"><Search size={22} /><h3>No matches found</h3><p>Try a different search or media filter.</p></div> :
          <div className="media-groups">{groups.map(([date, group]) => {
            const checkedCount = group.filter(file => selected.has(file.id)).length;
            const checked = checkedCount === group.length ? true : checkedCount ? 'indeterminate' : false;
            return <article className="date-section" key={date}>
              <header className="date-heading"><TickBox checked={checked} onChange={value => selectGroup(group, value === true)} label="Select all media in this date group" disabled={busy} /><div><h3>{date === 'Unknown-date' ? 'Date unavailable' : dateLabel(date)}</h3><span>{group.length} {group.length === 1 ? 'item' : 'items'}</span></div><div className="date-rule" /></header>
              <div className="media-rows">{group.map(file => <div className={`media-row ${selected.has(file.id)?'selected':''}`} key={file.id}>
                <TickBox checked={selected.has(file.id)} onChange={value => setSelected(old => { const next=new Set(old); value ? next.add(file.id) : next.delete(file.id); return next; })} label={`Select ${file.name}`} disabled={busy} />
                <div className={`file-art ${file.type==='Videos'?'video':''}`}>{file.type==='Videos'?<Film size={17}/>:<Image size={17}/>}<span>{file.type==='Videos'?'MOV':'IMG'}</span></div>
                <div className="media-copy"><strong title={file.name}>{file.name}</strong><span>{file.type==='Videos'?'Video':'Photo'} <i>·</i> {file.dateSource || 'Media file'}</span></div>
                <span className="file-size">{file.size > 0 ? bytesLabel(file.size) : 'On import'}</span>
              </div>)}</div>
            </article>;
          })}</div>}
        </section>
        <footer className="bottom-bar"><div className="footer-status"><span className={device.state==='connected'?'footer-dot':'footer-dot muted'} />{notice}</div><span className="privacy-label"><ShieldCheck size={13} /> On-device · private</span>{hasImported && destination && <button className="footer-open" onClick={async () => { const error = await window.aplet.openFolder(destination); if (error) setNotice(error); }}><FolderOpen size={14} />Open folder</button>}<button className="button import-button" disabled={busy || !selected.size || !destination} onClick={importSelected}><ArrowDownToLine size={16} />Import {selected.size ? `${selected.size.toLocaleString()} selected` : 'selected'}</button></footer>
      </main>
    </div>
  </div>;
}
