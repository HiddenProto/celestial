const pr0xySelect = document.getElementById('pr0xySelect');
const transportsele = document.getElementById('tselect');
const wispSelect = document.getElementById('wispSelect');
const wispCustom = document.getElementById('wispCustom');

const _ULTRAPATCH_WISP = 'wss://cst-celestial.loca.lt/wisp/';
const _isLocalHost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

pr0xySelect.addEventListener('change', () => {
    localStorage.setItem('pr0xy', pr0xySelect.value);
    location.reload();
});

transportsele.addEventListener('change', () => {
    localStorage.setItem('transportz', transportsele.value);
    location.reload();
});

wispSelect.addEventListener('change', () => {
    if (wispSelect.value === 'custom') {
        wispCustom.style.display = 'block';
        wispCustom.focus();
    } else {
        wispCustom.style.display = 'none';
        localStorage.setItem('location', wispSelect.value);
        location.reload();
    }
});

wispCustom.addEventListener('change', () => {
    const val = wispCustom.value.trim();
    if (val.startsWith('wss://') || val.startsWith('ws://')) {
        localStorage.setItem('location', val);
        location.reload();
    }
});

wispCustom.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') wispCustom.dispatchEvent(new Event('change'));
});

window.addEventListener('DOMContentLoaded', () => {
    const savedProxy = localStorage.getItem('pr0xy');
    if (savedProxy && [...pr0xySelect.options].some(o => o.value === savedProxy))
        pr0xySelect.value = savedProxy;

    const savedTransport = localStorage.getItem('transportz');
    if (savedTransport && [...transportsele.options].some(o => o.value === savedTransport))
        transportsele.value = savedTransport;

    // Stale sentinel value from old __origin__ bug — clean up silently
    let savedWisp = localStorage.getItem('location');
    if (savedWisp === '__origin__') { localStorage.removeItem('location'); savedWisp = null; }

    if (!savedWisp) {
        // No Wisp saved: default to bumblcat ultrapatch on regular sites;
        // on localhost show same-origin URL in custom field (direct, no roundtrip).
        if (_isLocalHost) {
            const localWisp = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/wisp/';
            wispSelect.value = 'custom';
            wispCustom.style.display = 'block';
            wispCustom.value = localWisp;
        } else {
            wispSelect.value = _ULTRAPATCH_WISP;
        }
    } else if ([...wispSelect.options].some(o => o.value === savedWisp)) {
        wispSelect.value = savedWisp;
    } else {
        wispSelect.value = 'custom';
        wispCustom.style.display = 'block';
        wispCustom.value = savedWisp;
    }
});
