'use strict';

const state = { source: null, destination: null, files: [], selected: new Set(), filter: 'all' };
const $ = (id) => document.getElementById(id);
let busy = false;
function showProgress(label, value, total) {
  $('operation-progress').classList.remove('hidden');
  $('progress-label').textContent = label;
  if (Number.isFinite(value) && Number.isFinite(total) && total > 0) {
    $('progress-bar').max = total;
    $('progress-bar').value = Math.min(value, total);
  } else {
    $('progress-bar').removeAttribute('value');
  }
}
function setBusy(value) {
  busy = value;
  for (const id of ['read-phone', 'choose-source', 'choose-destination']) $(id).disabled = value;
  if (!value) $('read-phone').textContent = 'Read iPhone';
  $('source-path').classList.toggle('working', value);
  document.querySelectorAll('.file-row input,.date-group input,#select-all').forEach(input => {
    input.disabled = value;
  });
  updateCounts();
}
let scanStartedAt = 0;
window.aplet.onScanProgress(({ found, elapsedMs }) => {
  const elapsed = Math.max(0.25, (elapsedMs || Date.now() - scanStartedAt) / 1000);
  const rate = Math.round(found / elapsed);
  const rateText = found ? ` · ${rate.toLocaleString()} files/sec` : '';
  $('source-path').textContent = `Reading iPhone · ${found.toLocaleString()} files found${rateText}`;
  showProgress(`Scanning · ${found.toLocaleString()} files found${rateText} · total not yet known`);
});
window.aplet.onPhoneProgress(({ phase, name, completed, total, bytes, totalBytes }) => {
  const saved = `${completed} of ${total} files saved`;
  const label = phase === 'saving'
    ? `Saving ${name} · ${saved}`
    : `${formatSize(bytes)} / ${formatSize(totalBytes)} transferred · ${saved}`;
  showProgress(label, bytes, totalBytes);
  $('status').textContent = label;
  $('source-path').textContent = phase === 'saved' ? saved
    : `${phase === 'saving' ? 'Saving' : 'Transferring'} ${name}`;
});
window.aplet.onLocalProgress(({ completed, total }) => {
  showProgress(`${completed} of ${total} local files processed`, completed, total);
});
$('read-phone').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  scanStartedAt = Date.now();
  $('read-phone').textContent = 'Reading iPhone…';
  showProgress('Opening iPhone storage…');
  $('source-path').textContent = 'Reading iPhone… Opening Internal Storage. Keep the phone unlocked.';
  $('connection-message').textContent = 'Reading your photo library. Large libraries take a few minutes.';
  state.files = [];
  state.selected.clear();
  state.source = null;
  render();
  $('status').textContent = 'Reading iPhone… Keep it unlocked.';
  try {
    const result = await window.aplet.scanPhone();
    state.source = 'iphone';
    state.files = result.files;
    showProgress(`Scan complete · ${result.files.length.toLocaleString()} files · ${result.errors.length} folder errors`, 1, 1);
    $('source-path').textContent = `${result.device} · ${result.files.length.toLocaleString()} files`;
    $('status').textContent = result.files.length
      ? `${result.files.length} media files${result.errors.length ? ` · ${result.errors.length} folders could not be read` : ''}`
      : 'No accessible media. Unlock the phone and allow photo access, then try again.';
    render();
  } catch (error) {
    $('operation-progress').classList.add('hidden');
    $('status').textContent = error.message;
    $('source-path').textContent = error.message;
  } finally { setBusy(false); }
});

function applyTheme(theme) {
  const dark = window.ApletTheme.resolveTheme(theme, false) === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').textContent = dark ? 'Light mode' : 'Dark mode';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
}

const savedTheme = localStorage.getItem('aplet-theme');
applyTheme(window.ApletTheme.resolveTheme(savedTheme, window.matchMedia('(prefers-color-scheme: dark)').matches));
$('theme-toggle').addEventListener('click', () => {
  const nextTheme = window.ApletTheme.nextTheme(document.documentElement.dataset.theme);
  localStorage.setItem('aplet-theme', nextTheme);
  applyTheme(nextTheme);
});

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function visibleFiles() {
  const query = $('search').value.trim().toLocaleLowerCase();
  return state.files.filter((file) =>
    (state.filter === 'all' || file.type === state.filter) &&
    file.name.toLocaleLowerCase().includes(query)
  ).sort((a, b) => {
    if (a.date === 'Unknown-date' && b.date !== 'Unknown-date') return 1;
    if (b.date === 'Unknown-date' && a.date !== 'Unknown-date') return -1;
    return b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
  });
}

function updateCounts() {
  $('count-all').textContent = state.files.length;
  $('count-photos').textContent = state.files.filter((file) => file.type === 'Photos').length;
  $('count-videos').textContent = state.files.filter((file) => file.type === 'Videos').length;
  $('selected-count').textContent = `${state.selected.size} selected`;
  $('import-button').disabled = busy || state.selected.size === 0 || !state.destination;
  $('choose-destination').textContent = state.destination ? 'Change destination' : 'Choose destination';
  $('select-visible').disabled = busy || state.files.length === 0;
  $('clear-selection').disabled = busy || state.selected.size === 0;
}

function render() {
  const files = visibleFiles();
  $('empty').classList.toggle('hidden', files.length !== 0);
  $('file-list').classList.toggle('hidden', files.length === 0);
  $('empty').querySelector('h3').textContent = state.files.length ? 'No matching files' : 'No files to show';
  $('empty').querySelector('p').textContent = state.files.length ? 'Try another search or filter.' : 'Choose a source folder to find photos and videos.';
  $('file-rows').replaceChildren();
  const fragment = document.createDocumentFragment();
  const groups = new Map();
  for (const file of files) {
    if (!groups.has(file.date)) groups.set(file.date, []);
    groups.get(file.date).push(file);
  }
  let lastDate = null;
  for (const file of files) {
    if (file.date !== lastDate) {
      lastDate = file.date;
      const heading = document.createElement('div');
      heading.className = 'date-group';
      const label = document.createElement('label');
      const groupCheck = document.createElement('input');
      groupCheck.type = 'checkbox';
      groupCheck.dataset.date = file.date;
      groupCheck.setAttribute('aria-label', `Select all files dated ${file.date}`);
      groupCheck.disabled = busy;
      groupCheck.addEventListener('change', () => {
        for (const member of groups.get(file.date)) {
          if (groupCheck.checked) state.selected.add(member.id);
          else state.selected.delete(member.id);
        }
        render();
      });
      const title = document.createElement('strong');
      title.textContent = file.date === 'Unknown-date' ? 'Unknown date' : file.date;
      const count = document.createElement('span');
      count.textContent = `${groups.get(file.date).length.toLocaleString()} files`;
      label.append(groupCheck, title, count);
      heading.append(label);
      fragment.append(heading);
    }
    const row = document.createElement('div');
    row.className = 'file-row';
    const checkCell = document.createElement('span');
    checkCell.className = 'check-wrap';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.disabled = busy;
    check.checked = state.selected.has(file.id);
    check.setAttribute('aria-label', `Select ${file.name}`);
    check.addEventListener('change', () => {
      if (check.checked) state.selected.add(file.id);
      else state.selected.delete(file.id);
      updateCounts();
      updateSelectAll(files);
    });
    checkCell.append(check);
    const name = document.createElement('span');
    name.className = 'file-name';
    name.title = file.name;
    name.textContent = file.name;
    const type = document.createElement('span');
    type.className = 'file-type';
    type.textContent = file.type === 'Photos' ? 'Photo' : 'Video';
    const date = document.createElement('span');
    date.className = 'file-date';
    date.textContent = file.date;
    date.title = `Date from ${file.dateSource}`;
    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = formatSize(file.size);
    row.append(checkCell, name, type, date, size);
    fragment.append(row);
  }
  $('file-rows').append(fragment);
  updateSelectAll(files);
  updateCounts();
}

function updateSelectAll(files = visibleFiles()) {
  const selectAll = $('select-all');
  selectAll.checked = files.length > 0 && files.every((file) => state.selected.has(file.id));
  selectAll.indeterminate = files.some((file) => state.selected.has(file.id)) && !selectAll.checked;
  selectAll.disabled = busy;
  const counts = new Map();
  for (const file of files) {
    const count = counts.get(file.date) || { total: 0, selected: 0 };
    count.total++;
    if (state.selected.has(file.id)) count.selected++;
    counts.set(file.date, count);
  }
  document.querySelectorAll('.date-group input').forEach(check => {
    const count = counts.get(check.dataset.date);
    check.checked = count.selected === count.total;
    check.indeterminate = count.selected > 0 && !check.checked;
  });
}

$('select-visible').addEventListener('click', () => {
  if (busy) return;
  for (const file of visibleFiles()) state.selected.add(file.id);
  render();
});
$('clear-selection').addEventListener('click', () => {
  if (busy) return;
  state.selected.clear();
  render();
});

function checkAppleDevice() {
  const status = $('connection-status');
  const message = $('connection-message');
  const button = $('check-device');
  if (button.disabled) return Promise.resolve();
  status.classList.remove('connected', 'error');
  button.disabled = true;
  message.textContent = 'Checking for iPhone…';
  return Promise.resolve()
    .then(() => window.aplet.detectAppleDevice())
    .then((result) => {
    if (!result.supported) {
      status.classList.add('error');
      message.textContent = 'iPhone detection is available on Windows only.';
    } else if (result.error) {
      status.classList.add('error');
      message.textContent = result.error;
    } else if (result.devices.length) {
      const device = result.devices[0];
      const healthy = device.status.toLowerCase() === 'ok';
      status.classList.add(healthy ? 'connected' : 'error');
      message.textContent = healthy
        ? (busy ? 'Apple device connected. Reading or importing media…' : 'Apple device connected. Click Read iPhone.')
        : `Apple device needs attention: ${device.name} (${device.status})`;
    } else {
      status.classList.add('error');
      message.textContent = 'No iPhone found. Check the cable, unlock and trust this PC, then check the Apple driver.';
    }
    })
    .finally(() => {
    button.disabled = false;
    });
}

function reportDeviceCheckFailure(error) {
  $('connection-status').classList.add('error');
  $('connection-message').textContent = 'Could not check for an iPhone.';
  console.error('Apple device check failed:', error);
}

$('check-device').addEventListener('click', () => {
  checkAppleDevice().catch(reportDeviceCheckFailure);
});
window.addEventListener('focus', () => {
  checkAppleDevice().catch(reportDeviceCheckFailure);
});

$('choose-source').addEventListener('click', async () => {
  if (busy) return;
  const folder = await window.aplet.chooseFolder('Choose iPhone media folder');
  if (!folder) return;
  $('status').textContent = 'Scanning…';
  showProgress('Scanning local folder…');
  setBusy(true);
  $('choose-source').disabled = true;
  try {
    const result = await window.aplet.scanMedia(folder);
    state.source = folder;
    state.files = result.files;
    showProgress(`Scan complete · ${result.files.length.toLocaleString()} files`, 1, 1);
    state.selected.clear();
    $('source-path').textContent = folder;
    $('source-path').title = folder;
    $('status').textContent = result.errors.length
      ? `Found ${result.files.length} media files · ${result.errors.length} folders/files could not be read`
      : `${result.files.length} media files found`;
    $('step-source').classList.add('done');
    $('step-review').classList.toggle('active', result.files.length > 0);
    render();
  } catch (error) {
    $('operation-progress').classList.add('hidden');
    $('status').textContent = error.message;
  } finally {
    setBusy(false);
  }
});

$('choose-destination').addEventListener('click', async () => {
  const folder = await window.aplet.chooseFolder('Choose where to save your media');
  if (!folder) return;
  state.destination = folder;
  $('status').textContent = `Saving to ${folder}`;
  $('step-destination').classList.add('active');
  $('step-destination').classList.toggle('done', true);
  $('step-review').classList.toggle('active', state.files.length > 0);
  updateCounts();
});

$('select-all').addEventListener('change', () => {
  const files = visibleFiles();
  for (const file of files) {
    if ($('select-all').checked) state.selected.add(file.id);
    else state.selected.delete(file.id);
  }
  render();
});

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.filter.selected').classList.remove('selected');
  button.classList.add('selected');
  state.filter = button.dataset.filter;
  render();
}));
$('search').addEventListener('input', render);

$('import-button').addEventListener('click', async () => {
  if (busy) return;
  const files = state.files.filter((file) => state.selected.has(file.id));
  if (!files.length || !state.destination) return;
  setBusy(true);
  showProgress('Preparing import…');
  $('import-button').disabled = true;
  $('choose-source').disabled = true;
  $('choose-destination').disabled = true;
  $('status').textContent = `Importing ${files.length} files…`;
  try {
    const results = state.source === 'iphone'
      ? await window.aplet.importPhone({ destination: state.destination, ids: files.map(file => file.id) })
      : await window.aplet.importMedia({
      source: state.source,
      destination: state.destination,
      files
    });
    const copied = results.filter((result) => result.ok);
    const failed = files.length - copied.length;
    if (failed) {
      $('progress-label').textContent = `${copied.length} saved · ${failed} not imported. See the error below.`;
      if (!$('progress-bar').hasAttribute('value')) $('progress-bar').value = 0;
    } else showProgress(`Import complete · ${copied.length} files saved`, copied.length, copied.length);
    if (state.source === 'iphone') {
      for (const result of copied) state.selected.delete(result.id);
    } else if (!failed) state.selected.clear();
    $('status').textContent = failed
      ? `${copied.length} imported · ${failed} not imported. ${results.find(result => !result.ok)?.error || ''}`
      : `${copied.length} files imported`;
    render();
    if (copied.length) {
      const open = document.createElement('button');
      open.className = 'button secondary';
      open.textContent = 'Open folder';
      open.addEventListener('click', async () => {
        const error = await window.aplet.openFolder(state.destination);
        if (error) $('status').textContent = error;
      });
      document.querySelector('.bottom-bar').append(open);
      window.setTimeout(() => open.remove(), 10000);
    }
  } catch (error) {
    $('operation-progress').classList.add('hidden');
    $('status').textContent = error.message;
  } finally {
    setBusy(false);
    $('choose-source').disabled = false;
    $('choose-destination').disabled = false;
    updateCounts();
  }
});

render();
checkAppleDevice().catch(reportDeviceCheckFailure);
