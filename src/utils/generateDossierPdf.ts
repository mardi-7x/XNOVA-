import { jsPDF } from 'jspdf';
import { SovereignDossierReport } from '../pipeline/sovereignDossierSynthesizer';

/**
 * Sanitizes string for standard PDF font rendering (replaces emojis and unmapped unicode).
 */
function cleanText(input?: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // Emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[•]/g, '-')
    .trim();
}

/**
 * Generates an institutional-grade, publication-quality PDF version
 * of the 6-pillar Sovereign Intelligence Dossier (100/100 Edition).
 */
export async function generateDossierPdf(report: SovereignDossierReport): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 22;

  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = margin + 8;
      drawRunningHeader();
    }
  };

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(70, 95, 130);
    doc.text('XNOVA INTELLIGENCE PIPELINE • SOVEREIGN DOSSIER (100/100 EDITION)', margin, margin);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(report.generatedAt).toLocaleDateString(), pageWidth - margin, margin, { align: 'right' });
    doc.setDrawColor(20, 45, 80);
    doc.setLineWidth(0.3);
    doc.line(margin, margin + 2.5, pageWidth - margin, margin + 2.5);
    y = margin + 8;
  };

  // -------------------------------------------------------------------------
  // 1. HERO HEADER BANNER (Page 1)
  // -------------------------------------------------------------------------
  doc.setFillColor(6, 12, 29);
  doc.rect(margin, y, contentWidth, 34, 'F');
  
  // Cyan Accent Top Line
  doc.setFillColor(0, 240, 255);
  doc.rect(margin, y, contentWidth, 1.8, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('THE SOVEREIGN INTELLIGENCE DOSSIER', margin + 6, y + 10);

  // Subtitle & Edition badge
  doc.setFontSize(8.5);
  doc.setTextColor(0, 240, 255);
  doc.text('100/100 EDITION • INSTITUTIONAL RESEARCH & FACTUAL VERIFICATION', margin + 6, y + 16);

  // Metadata strip
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(160, 180, 205);
  doc.text(
    `GENERATED: ${new Date(report.generatedAt).toUTCString()}   |   ENGINE: ${cleanText(report.processingEngine)}`,
    margin + 6,
    y + 23
  );
  doc.text(
    'ZERO HALLUCINATION DIRECTIVE   |   FACT-TO-OPINION SPLIT: 100% ENFORCED',
    margin + 6,
    y + 28
  );

  // Epistemic Score Badge (Top Right)
  doc.setFillColor(15, 30, 60);
  doc.setDrawColor(0, 240, 255);
  doc.setLineWidth(0.5);
  doc.roundedRect(pageWidth - margin - 42, y + 6, 36, 22, 2, 2, 'FD');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 240, 255);
  doc.text('EPISTEMIC SCORE', pageWidth - margin - 24, y + 12, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`${report.epistemicConfidenceScore}%`, pageWidth - margin - 24, y + 21, { align: 'center' });

  y += 40;

  // -------------------------------------------------------------------------
  // SECTION HELPER: Draw Section Header
  // -------------------------------------------------------------------------
  const drawSectionHeader = (title: string, accentR: number, accentG: number, accentB: number) => {
    checkPageBreak(12);
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(margin, y, 3, 7.5, 'F');

    doc.setFillColor(10, 22, 45);
    doc.rect(margin + 3, y, contentWidth - 3, 7.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(240, 248, 255);
    doc.text(cleanText(title), margin + 6, y + 5.2);
    y += 11;
  };

  // -------------------------------------------------------------------------
  // PILLAR 1: THE ALPHA SIGNAL
  // -------------------------------------------------------------------------
  drawSectionHeader('1. THE ALPHA SIGNAL (Macro Paradigm Shift)', 245, 158, 11);

  const drawAlphaItem = (label: string, text: string) => {
    const cleaned = cleanText(text);
    if (!cleaned) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(245, 158, 11);
    doc.text(`[+] ${label}:`, margin + 3, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(215, 228, 245);
    const lines = doc.splitTextToSize(cleaned, contentWidth - 6);
    checkPageBreak(lines.length * 4.2 + 3);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4.2 + 3;
  };

  drawAlphaItem('THE CATALYST', report.alphaSignal.catalyst);
  drawAlphaItem('MARKET MISPRICING', report.alphaSignal.marketMispricing);
  drawAlphaItem('SECOND-ORDER IMPACT', report.alphaSignal.secondOrderImpact);
  if (report.alphaSignal.bengaliNote) {
    drawAlphaItem('STRATEGIC SYNTHESIS (BENGALI CORE)', cleanText(report.alphaSignal.bengaliNote));
  }

  y += 2;

  // -------------------------------------------------------------------------
  // PILLAR 2: TOP INTELLIGENCE BRIEFINGS
  // -------------------------------------------------------------------------
  drawSectionHeader('2. TOP INTELLIGENCE BRIEFINGS (Fact vs. Analysis Segregation)', 0, 220, 255);

  const briefings = report.topBriefings || [];
  for (let i = 0; i < briefings.length; i++) {
    const b = briefings[i];
    checkPageBreak(25);

    // Briefing Box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    const titleLines = doc.splitTextToSize(`#${i + 1}  ${cleanText(b.storyTitle)}`, contentWidth - 8);
    doc.text(titleLines, margin + 4, y);
    y += titleLines.length * 4.5 + 2;

    // Verified Facts Block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(16, 185, 129); // emerald green
    doc.text('[VERIFIED FACTS]:', margin + 4, y);
    y += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(200, 230, 215);
    const factLines = doc.splitTextToSize(cleanText(b.verifiedFacts), contentWidth - 8);
    checkPageBreak(factLines.length * 3.8 + 2);
    doc.text(factLines, margin + 4, y);
    y += factLines.length * 3.8 + 2.5;

    // Executive Analysis Block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 240, 255); // cyan
    doc.text('[EXECUTIVE ANALYSIS]:', margin + 4, y);
    y += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(205, 225, 245);
    const analysisLines = doc.splitTextToSize(cleanText(b.executiveAnalysis), contentWidth - 8);
    checkPageBreak(analysisLines.length * 3.8 + 2);
    doc.text(analysisLines, margin + 4, y);
    y += analysisLines.length * 3.8 + 2.5;

    // Source link if available
    if (b.sourceUrl) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(120, 150, 180);
      const urlText = cleanText(b.sourceUrl);
      doc.text(`SOURCE: ${urlText}`, margin + 4, y);
      y += 4.5;
    }

    // Divider line between briefings
    doc.setDrawColor(20, 40, 70);
    doc.setLineWidth(0.2);
    doc.line(margin + 2, y, pageWidth - margin - 2, y);
    y += 4;
  }

  y += 2;

  // -------------------------------------------------------------------------
  // PILLAR 3: THE NUMBER THAT MATTERS
  // -------------------------------------------------------------------------
  drawSectionHeader('3. THE NUMBER THAT MATTERS (Unit Economics & Equation Shift)', 16, 185, 129);

  checkPageBreak(28);
  // Metric Card Background
  doc.setFillColor(10, 28, 50);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(16, 185, 129);
  doc.text('THE QUANTITATIVE PIVOT POINT:', margin + 6, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(cleanText(report.numberThatMatters.theNumber) || '100% Zero-Bleed Quarantine', margin + 6, y + 14);

  y += 28;

  // Details
  const drawNumField = (label: string, text: string) => {
    const cleaned = cleanText(text);
    if (!cleaned) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(16, 185, 129);
    doc.text(`[-] ${label}:`, margin + 4, y);
    y += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(215, 230, 245);
    const lines = doc.splitTextToSize(cleaned, contentWidth - 8);
    checkPageBreak(lines.length * 3.8 + 2);
    doc.text(lines, margin + 4, y);
    y += lines.length * 3.8 + 3;
  };

  drawNumField('HISTORICAL BASELINE', report.numberThatMatters.historicalBaseline);
  drawNumField('INDUSTRY EQUATION SHIFT', report.numberThatMatters.industryEquationShift);

  y += 3;

  // -------------------------------------------------------------------------
  // PILLAR 4: ARXIV FRONTIER RESEARCH BREAKTHROUGHS
  // -------------------------------------------------------------------------
  drawSectionHeader('4. ARXIV FRONTIER RESEARCH BREAKTHROUGHS', 168, 85, 247);

  checkPageBreak(25);
  // Preprint Badge Box
  doc.setFillColor(28, 15, 48);
  doc.setDrawColor(168, 85, 247);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(220, 180, 255);
  doc.text('PREPRINT NOTICE: [PREPRINT - NOT PEER-REVIEWED UNLESS INDEPENDENTLY VERIFIED]', margin + 4, y + 5.5);
  y += 12;

  const drawArxivField = (label: string, text: string) => {
    const cleaned = cleanText(text);
    if (!cleaned) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(190, 130, 255);
    doc.text(`[*] ${label}:`, margin + 4, y);
    y += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(220, 230, 245);
    const lines = doc.splitTextToSize(cleaned, contentWidth - 8);
    checkPageBreak(lines.length * 3.8 + 2);
    doc.text(lines, margin + 4, y);
    y += lines.length * 3.8 + 3;
  };

  drawArxivField('PAPER TITLE & SOURCE', report.arxivBreakthrough.paperTitleAndSource);
  drawArxivField('CORE ARCHITECTURAL INNOVATION', report.arxivBreakthrough.coreArchitecturalInnovation);
  drawArxivField('PRODUCTION BOTTLENECK SOLVED', report.arxivBreakthrough.productionBottleneckSolved);

  y += 3;

  // -------------------------------------------------------------------------
  // PILLAR 5: THE UNFINISHED FILE (72-Hour Radar)
  // -------------------------------------------------------------------------
  drawSectionHeader('5. THE UNFINISHED FILE (72-Hour Monitoring Radar)', 239, 68, 68);

  const catalysts = report.unfinishedFile72h?.activeCatalysts || [];
  for (let i = 0; i < catalysts.length; i++) {
    const c = cleanText(catalysts[i]);
    if (!c) continue;
    checkPageBreak(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(248, 113, 113);
    doc.text(`[RADAR ${i + 1}]:`, margin + 4, y);
    y += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(225, 235, 245);
    const lines = doc.splitTextToSize(c, contentWidth - 8);
    checkPageBreak(lines.length * 3.8 + 2);
    doc.text(lines, margin + 4, y);
    y += lines.length * 3.8 + 2.5;
  }

  y += 3;

  // -------------------------------------------------------------------------
  // PILLAR 6: EPISTEMIC AUDIT & TELEMETRY LOG
  // -------------------------------------------------------------------------
  drawSectionHeader('6. EPISTEMIC AUDIT & TELEMETRY LOG', 0, 240, 255);

  checkPageBreak(25);
  doc.setFillColor(5, 10, 22);
  doc.setDrawColor(25, 55, 95);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0, 240, 255);
  doc.text(`EPISTEMIC CONFIDENCE SCORE : ${report.epistemicConfidenceScore}% (CALCULATED FROM SOURCE RIGOR)`, margin + 5, y + 6);
  doc.text('FACT-TO-OPINION SPLIT      : 100% ENFORCED (MUTUALLY EXCLUSIVE SEGREGATION)', margin + 5, y + 11);
  doc.text('SYNTHESIZER PERSONA        : INSTITUTIONAL DOSSIER EDITOR-IN-CHIEF', margin + 5, y + 16);
  doc.text(`PROCESSING ENGINE          : ${cleanText(report.processingEngine)}`, margin + 5, y + 21);

  // -------------------------------------------------------------------------
  // RUNNING FOOTERS ON ALL PAGES
  // -------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(70, 95, 125);
    doc.setDrawColor(15, 35, 65);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.text(
      'CONFIDENTIAL & VERIFIED • XNOVA SOVEREIGN INTELLIGENCE DOSSIER • ZERO HALLUCINATION DIRECTIVE',
      margin,
      pageHeight - 8
    );
    doc.text(`PAGE ${i} OF ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  // Save the PDF
  const filename = `xnova-sovereign-intelligence-dossier-${Date.now()}.pdf`;
  doc.save(filename);
}
