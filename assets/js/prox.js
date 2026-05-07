const pr0xySelect = document.getElementById('pr0xySelect');
const transportsele = document.getElementById('tselect');
const wispSelect = document.getElementById('wispSelect');
const wispCustom = document.getElementById('wispCustom');

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

    const savedWisp = localStorage.getItem('location') || 'wss://wisp.mercurywork.shop/';
    if ([...wispSelect.options].some(o => o.value === savedWisp)) {
        wispSelect.value = savedWisp;
    } else if (savedWisp && savedWisp !== 'wss://wisp.mercurywork.shop/') {
        wispSelect.value = 'custom';
        wispCustom.style.display = 'block';
        wispCustom.value = savedWisp;
    }
});
