function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function parseDate(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const m = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    let y = parseInt(parts[2], 10);
    if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
    return new Date(y, m - 1, d);
}

function formatDate(date) {
    if (!date || isNaN(date.getTime())) return 'Invalid';
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
}

function addDays(date, days) {
    if (!date) return null;
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function parseTiming(timing) {
    if (!timing || timing === 'on frost-free date') return {min: 0, max: 0, after: false};
    const match = timing.match(/(\d+)( to (\d+))? weeks (before|after)/);
    if (!match) return {min: 0, max: 0, after: false};
    const min = parseInt(match[1], 10);
    const max = match[3] ? parseInt(match[3], 10) : min;
    const after = match[4] === 'after';
    return {min, max, after};
}

function parseWeeks(weeksStr) {
    if (!weeksStr || weeksStr === '—') return {min: 0, max: 0};
    const match = weeksStr.match(/(\d+)–(\d+)/);
    if (!match) return {min: parseInt(weeksStr, 10) || 0, max: parseInt(weeksStr, 10) || 0};
    return {min: parseInt(match[1], 10), max: parseInt(match[2], 10)};
}

function parseMaturity(maturityStr) {
    if (!maturityStr || maturityStr.includes('Perennial') || maturityStr.includes('year')) return {min: 0, max: 0};
    const match = maturityStr.match(/(\d+)–(\d+)/);
    if (!match) return {min: parseInt(maturityStr, 10) || 0, max: parseInt(maturityStr, 10) || 0};
    return {min: parseInt(match[1], 10), max: parseInt(match[2], 10)};
}
