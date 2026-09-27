import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  runAxeAuditOnHtml,
  auditCssFocusVisible,
  auditChartAccessibility,
  runFullAccessibilityAudit,
} from '../../scripts/audit-accessibility.mjs';

const projectRoot = resolve(import.meta.dirname, '../..');

test('TASK-27-02: full accessibility audit passes with zero WCAG 2.1 AA violations', async () => {
  const audit = await runFullAccessibilityAudit();
  assert.equal(audit.success, true);
  assert.equal(audit.totalViolations, 0);
  assert.equal(audit.cssAudit.success, true);
  assert.equal(audit.chartAudit.success, true);
  assert.equal(audit.dashboardAxe.violations.length, 0);
  assert.equal(audit.ledgerAxe.violations.length, 0);
});

test('TASK-27-02: global CSS enforces visible focus indicators on all interactive controls (NFR-05, Test T-09)', async () => {
  const cssPath = join(projectRoot, 'apps', 'web', 'src', 'index.css');
  const cssAudit = await auditCssFocusVisible(cssPath);
  assert.equal(cssAudit.success, true);
  assert.equal(cssAudit.hasGlobalFocusVisible, true);
  assert.equal(cssAudit.violations.length, 0);
});

test('TASK-27-02: charts expose screen reader text equivalents and SVG rendering (NFR-05, FR-12)', async () => {
  const chartPath = join(projectRoot, 'apps', 'web', 'src', 'EChart.tsx');
  const chartAudit = await auditChartAccessibility(chartPath);
  assert.equal(chartAudit.success, true);
  assert.equal(chartAudit.checks.hasRoleImg, true);
  assert.equal(chartAudit.checks.hasAriaLabel, true);
  assert.equal(chartAudit.checks.hasSvgRenderer, true);
  assert.equal(chartAudit.violations.length, 0);
});

test('TASK-27-02: HTML document has lang, responsive viewport meta, and meaningful title', async () => {
  const htmlPath = join(projectRoot, 'apps', 'web', 'index.html');
  const html = await readFile(htmlPath, 'utf8');

  assert.match(html, /<html\s+lang=["']en["']/i);
  assert.match(html, /<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i);
  assert.match(html, /<title>EasyLedger[^<]*<\/title>/i);
});

test('TASK-27-02: axe-core audit engine accurately catches inaccessible elements when injected', async () => {
  const badHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Inaccessible Test</title></head>
    <body>
      <main>
        <button type="button"></button>
        <img src="chart.png" />
      </main>
    </body>
    </html>
  `;
  const result = await runAxeAuditOnHtml(badHtml, 'Bad HTML Test');
  assert.ok(result.violations.length >= 2, 'Expected axe-core to detect missing button name and missing alt attribute');
  const ruleIds = result.violations.map((v) => v.id);
  assert.ok(ruleIds.includes('button-name'));
  assert.ok(ruleIds.includes('image-alt'));
});
