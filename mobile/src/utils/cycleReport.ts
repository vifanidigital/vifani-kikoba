type ArchivedMember = {
  fullName?: string;
  myPapoMandatoryDebt?: number;
  payoutAfterPapoRepayment?: number;
  otherDeductions?: number;
  balanceToCollect?: number;
  netPayout?: number;
};

export type CycleReport = {
  startedAt: string;
  closedAt: string;
  groupName: string;
  result: {
    membersPayout: ArchivedMember[];
    distributableProfitPool?: number;
    totalExpenses?: number;
  };
};

const money = (amount?: number) => typeof amount === 'number' && Number.isFinite(amount)
  ? 'TZS ' + amount.toLocaleString('en-TZ') : '—';
const date = (value: string) => new Date(value).toLocaleDateString('sw-TZ', { timeZone: 'Africa/Dar_es_Salaam' });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

export function cycleReportHtml(report: CycleReport) {
  if (!report?.result || !Array.isArray(report.result.membersPayout)) throw new Error('Ripoti haina orodha iliyohifadhiwa ya mgao.');
  const rows = report.result.membersPayout.map(member =>
    '<tr><td>' + escapeHtml(member.fullName || 'Mwanachama') + '</td><td>' + money(member.myPapoMandatoryDebt) +
    '</td><td>' + money(member.payoutAfterPapoRepayment) + '</td><td>' + money(member.otherDeductions) +
    '</td><td>' + money(member.balanceToCollect) + '</td><td>' + money(member.netPayout) + '</td></tr>',
  ).join('');
  return '<!doctype html><html lang="sw"><head><meta charset="utf-8"><title>Ripoti ya kufunga Kikoba</title>' +
    '<style>body{font:13px sans-serif;padding:18px;color:#173b35}table{border-collapse:collapse;width:100%}th,td{border:1px solid #a1b8b0;padding:6px;text-align:left}th{background:#e5f1ed}tr{break-inside:avoid}thead{display:table-header-group}</style></head><body>' +
    '<h1>Ripoti ya kufunga Kikoba</h1><h2>' + escapeHtml(report.groupName || 'Kikoba') + '</h2><p>' +
    date(report.startedAt) + ' hadi ' + date(report.closedAt) + '</p><p>Faida ya kugawa: ' +
    money(report.result.distributableProfitPool) + ' | Matumizi: ' + money(report.result.totalExpenses) +
    '</p><table><thead><tr><th>Mwanachama</th><th>Papo ya kurejesha</th><th>Fedha za kutoa baada ya marejesho</th><th>Makato mengine</th><th>Salio jingine la kulipa</th><th>Mgawo halisi</th></tr></thead><tbody>' +
    rows + '</tbody></table><p>Alama ya — inaonyesha kiasi ambacho hakijahifadhiwa kwenye ripoti hii.</p></body></html>';
}
