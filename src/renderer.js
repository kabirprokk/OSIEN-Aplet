const state = { source: null, destination: null, files: [], selected: new Set(), filter: 'all' };
const $ = (id) => document.getElementById(id);

function applyTheme(theme) {
  const dark = ApletTheme.resolveTheme(theme, false) === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').textContent = dark ? 'Light mode' : 'Dark mode';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
}

const savedTheme = localStorage.getItem('aplet-theme');
applyTheme(ApletTheme.resolveTheme(savedTheme, window.matchMedia('(prefers-color-scheme: dark)').matches));
$('theme-toggle').addEventListener('click', () => {
  const nextTheme = ApletTheme.nextTheme(document.documentElement.dataset.theme);
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
  );
}

function updateCounts() {
  $('count-all').textContent = state.files.length;
  $('count-photos').textContent = state.files.filter((file) => file.type === 'Photos').length;
  $('count-videos').textContent = state.files.filter((file) => file.type === 'Videos').length;
  $('selected-count').textContent = `${state.selected.size} selected`;
  $('import-button').disabled = state.selected.size === 0 || !state.destination;
  $('choose-destination').textContent = state.destination ? 'Change destination' : 'Choose destination';
}

function render() {
  const files = visibleFiles();
  $('empty').classList.toggle('hidden', files.length !== 0);
  $('file-list').classList.toggle('hidden', files.length === 0);
  $('empty').querySelector('h3').textContent = state.files.length ? 'No matching files' : 'No files to show';
  $('empty').querySelector('p').textContent = state.files.length ? 'Try another search or filter.' : 'Choose a source folder to find photos and videos.';
  $('file-rows').replaceChildren();
  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'file-row';
    const checkCell = document.createElement('span');
    checkCell.className = 'check-wrap';
    const check = document.createElement('input');
    check.type = 'checkbox';
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
    $('file-rows').append(row);
  }
  updateSelectAll(files);
  updateCounts();
}

function updateSelectAll(files = visibleFiles()) {
  const selectAll = $('select-all');
  selectAll.checked = files.length > 0 && files.every((file) => state.selected.has(file.id));
  selectAll.indeterminate = files.some((file) => state.selected.has(file.id)) && !selectAll.checked;
}

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
        ? `Apple device detected by Windows: ${device.name}. Choose a folder Windows exposes; direct phone browsing is not available yet.`
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
  const folder = await window.aplet.chooseFolder('Choose iPhone media folder');
  if (!folder) return;
  $('status').textContent = 'Scanning…';
  $('choose-source').disabled = true;
  try {
    const result = await window.aplet.scanMedia(folder);
    state.source = folder;
    state.files = result.files;
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
    $('status').textContent = error.message;
  } finally {
    $('choose-source').disabled = false;
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
  const files = state.files.filter((file) => state.selected.has(file.id));
  if (!files.length || !state.destination) return;
  $('import-button').disabled = true;
  $('choose-source').disabled = true;
  $('choose-destination').disabled = true;
  $('status').textContent = `Importing ${files.length} files…`;
  try {
    const results = await window.aplet.importMedia({
      source: state.source,
      destination: state.destination,
      files
    });
    const copied = results.filter((result) => result.ok);
    const failed = results.length - copied.length;
    state.selected.clear();
    $('status').textContent = failed
      ? `${copied.length} imported · ${failed} failed`
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
    $('status').textContent = error.message;
  } finally {
    $('choose-source').disabled = false;
    $('choose-destination').disabled = false;
    updateCounts();
  }
});

render();
checkAppleDevice().catch(reportDeviceCheckFailure);
