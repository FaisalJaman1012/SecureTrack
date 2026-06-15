import * as XLSX from 'xlsx';

const PROJECT_COLS = [
  'Serial No', 'Application Name', 'URL', 'Vulnerability Name', 'Severity',
  'Resolver Team', 'Mitigation Status', 'Scan/Test Date', 'Report Sharing Date',
  'Application Zone', 'Environment', 'Category', 'Email Subject', 'Engineer',
  'Go Live Status', 'Prod URL', 'Mitigation Status in Prod', 'Remarks',
  'Deadline Date', 'Assigned To', 'Created By', 'Created At'
];

const APP_COLS = [
  'Serial No', 'Application Name', 'URL', 'App Type', 'Environment', 'Status',
  'Exposure', 'Test Done', 'Last Test Date', 'Report Share Date', 'App Owner',
  'Mitigation Status', 'Remarks', 'Deadline Date', 'Assigned To', 'Created By', 'Created At'
];

const SEV_COLORS = {
  Critical: 'FFFF3860', High: 'FFFF6B35', Medium: 'FFF59E0B',
  Low: 'FF3B82F6', Informational: 'FF6B7280'
};

const STATUS_COLORS = {
  Resolved: 'FF10B981', Pending: 'FFF59E0B',
  'Risk Acceptance': 'FF3B82F6', 'Business Requirements': 'FF8B5CF6'
};

export function exportProjectsToExcel(projects) {
  const wb = XLSX.utils.book_new();

  // Projects sheet
  const rows = projects.map((p, i) => [
    i + 1, p.application_name, p.url, p.vulnerability_name, p.severity,
    p.resolver_team, p.mitigation_status, p.scan_date, p.report_sharing_date,
    p.application_zone, p.environment, p.category, p.email_subject, p.engineer,
    p.go_live_status, p.prod_url, p.mitigation_status_prod, p.remarks,
    p.deadline_date, p.assigned_to_name || p.assigned_to, p.created_by_name || p.created_by,
    p.created_at
  ]);

  const ws = XLSX.utils.aoa_to_sheet([PROJECT_COLS, ...rows]);

  // Column widths
  ws['!cols'] = [8, 20, 25, 25, 12, 22, 18, 14, 14, 14, 12, 14, 25, 12, 12, 25, 20, 25, 14, 14, 14, 18]
    .map(w => ({ wch: w }));

  // Style header row
  const headerRange = XLSX.utils.decode_range(`A1:${XLSX.utils.encode_col(PROJECT_COLS.length - 1)}1`);
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: 'FF0D1626' } },
      font: { bold: true, color: { rgb: 'FF00D4FF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        bottom: { style: 'medium', color: { rgb: 'FF2A4470' } }
      }
    };
  }

  // Style data rows
  rows.forEach((row, ri) => {
    const r = ri + 1;
    const sev = row[4];
    const mit = row[6];

    row.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      if (!ws[addr]) return;
      ws[addr].s = {
        fill: { fgColor: { rgb: r % 2 === 0 ? 'FF0D1626' : 'FF111C2E' } },
        font: { color: { rgb: 'FFE2EAF8' }, sz: 10 },
        alignment: { vertical: 'center', wrapText: false },
      };
    });

    // Color severity cell
    const sevAddr = XLSX.utils.encode_cell({ r, c: 4 });
    if (ws[sevAddr] && SEV_COLORS[sev]) {
      ws[sevAddr].s = { ...ws[sevAddr].s, font: { bold: true, color: { rgb: SEV_COLORS[sev] }, sz: 10 } };
    }

    // Color mitigation cell
    const mitAddr = XLSX.utils.encode_cell({ r, c: 6 });
    if (ws[mitAddr] && STATUS_COLORS[mit]) {
      ws[mitAddr].s = { ...ws[mitAddr].s, font: { bold: true, color: { rgb: STATUS_COLORS[mit] }, sz: 10 } };
    }
  });

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Project Tracker');

  // Summary sheet
  const sevCounts = {};
  projects.forEach(p => { sevCounts[p.severity] = (sevCounts[p.severity] || 0) + 1; });
  const mitCounts = {};
  projects.forEach(p => { mitCounts[p.mitigation_status] = (mitCounts[p.mitigation_status] || 0) + 1; });

  const summaryData = [
    ['SECURETRACK — EXPORT SUMMARY', ''],
    ['Generated', new Date().toLocaleString()],
    ['Total Projects', projects.length],
    ['', ''],
    ['SEVERITY BREAKDOWN', ''],
    ...Object.entries(sevCounts).map(([k, v]) => [k || 'Not Set', v]),
    ['', ''],
    ['MITIGATION STATUS', ''],
    ...Object.entries(mitCounts).map(([k, v]) => [k || 'Not Set', v]),
  ];

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs['!cols'] = [{ wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  XLSX.writeFile(wb, `SecureTrack_Projects_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportApplicationsToExcel(apps) {
  const wb = XLSX.utils.book_new();

  const rows = apps.map((a, i) => [
    i + 1, a.application_name, a.url, a.app_type, a.environment, a.status,
    a.exposure, a.test_done, a.last_test_date, a.report_share_date, a.app_owner,
    a.mitigation_status, a.remarks, a.deadline_date,
    a.assigned_to_name || a.assigned_to, a.created_by_name || a.created_by, a.created_at
  ]);

  const ws = XLSX.utils.aoa_to_sheet([APP_COLS, ...rows]);
  ws['!cols'] = [6, 22, 25, 12, 14, 12, 12, 12, 14, 14, 18, 16, 25, 14, 14, 14, 18].map(w => ({ wch: w }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Application List');
  XLSX.writeFile(wb, `SecureTrack_Applications_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
