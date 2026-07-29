export type QRCodeType = 'Regular' | 'Golden' | 'Campaign' | 'Developer';
export type QRCodeStatus = 'active' | 'disabled' | 'exhausted';

export interface QRCodeRecord {
  id: string;
  code: string;
  type: QRCodeType;
  prefix: string;
  batch: string;
  maxPlays: number;
  playCount: number;
  active: boolean;
  createdAt: Date;
  lastScannedAt?: Date;
  scansToday: number;
  // Campaign assignment (optional — absent on unassigned QR docs)
  campaignId?: string;
  campaignName?: string;
  campaignAssignedAt?: Date;
  campaignAssignedBy?: string;
  // Reward assignment (optional — absent on unassigned QR docs)
  rewardId?: string;
  rewardName?: string;
  rewardType?: string;
  rewardAssignedAt?: Date;
  rewardAssignedBy?: string;
}

export interface QRDashboardStats {
  totalGenerated:  number;
  activeQR:        number;   // active=true AND playCount < maxPlays
  disabledQR:      number;   // active=false  (matches search status='disabled')
  exhaustedQR:     number;   // active=true AND playCount >= maxPlays
  goldenQR:        number;
  developerQR:     number;
  scannedToday:    number;
  scannedThisWeek: number;
  scannedThisMonth:number;
  unusedQR:        number;   // playCount === 0
  lastSync:        string;
}

export interface QRGeneratorForm {
  prefix: string;
  quantity: number;
  maxPlays: number;
  type: QRCodeType;
}

export interface QRSearchFilters {
  qrId: string;
  batch: string;
  status: '' | QRCodeStatus;
  type?: '' | QRCodeType;
  campaignId?: string;
  rewardId?: string;
}

export interface QRAnalyticsData {
  label: string;
  scans: number;
}

export interface GoldenQRAction {
  type: 'pause' | 'resume' | 'disable';
}

// ── Batch Cards (aggregated from qrCodes docs, no dedicated collection) ──────

export interface QRBatchSummary {
  batchId:        string;
  batchName:      string;
  prefix:         string;
  type:           QRCodeType;
  qrCount:        number;
  activeCount:    number;
  disabledCount:  number;
  exhaustedCount: number;
  consumedPlays:  number;
  totalPlays:     number;
  completionPct:  number;   // consumedPlays / totalPlays
  usagePct:       number;   // (qrCount - unusedCount) / qrCount
  createdAt:      Date;     // earliest createdAt among docs in the batch
  status:         'active' | 'disabled' | 'mixed';
}

// ── Live Activity Feed ────────────────────────────────────────────────────────

export type LiveActivityKind = 'scan' | 'admin_op';

export interface LiveActivityEvent {
  id:        string;
  kind:      LiveActivityKind;
  message:   string;
  code?:     string;
  actor?:    string;
  ts:        Date;
}

// ── Saved Filters (localStorage-backed) ───────────────────────────────────────

export interface SavedQRFilter {
  id:      string;
  name:    string;
  filters: QRSearchFilters;
}

// ── Smart Warnings ────────────────────────────────────────────────────────────

export type SmartWarningKind = 'unused_batch' | 'almost_consumed' | 'duplicate_batch_name';

export interface SmartWarning {
  id:       string;
  kind:     SmartWarningKind;
  message:  string;
  batchId?: string;
  severity: 'info' | 'warning';
}

// ── Cursor-based pagination ───────────────────────────────────────────────────

export interface QRCodesPageFilters {
  type?:     QRCodeType;
  batchId?:  string;
  active?:   boolean;
}
