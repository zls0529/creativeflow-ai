export type ReadinessStatus='ready'|'configured'|'warning'|'unavailable'|'not_required';
export interface ReadinessItem {id:string;name:string;status:ReadinessStatus;severity:'blocking'|'warning'|'informational';explanation:string;remediation?:string}
export interface ReadinessReport {checkedAt:string;canGenerate:boolean;items:ReadinessItem[];workflowModes:string[];provisional:boolean}
