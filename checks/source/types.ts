export interface ArtifactEvidence { id: string; content: string; sha256: string; encoding?: 'utf8'|'base64' }
export interface ArtifactCheckResult { id: string; status: 'passed'|'failed'|'unverified'; detail: string }
export interface ReportCraftV2Check { id: 'zhijian-report-craft-core-v2'; md:string; html:string; pdf:string; craftEvidence:string; materialPackId:'zhijian-report-craft-v2'; materialDigest:string; style:'credit-policy'|'designer-paper' }
