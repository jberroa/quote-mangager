export interface ITRAKModule {
  id: string;
  category: string;
  name: string;
  description: string;
  monthlyCost: number;
  isIncluded?: boolean;
  setupFee?: number;
}

export const ITRAK_MODULES: ITRAKModule[] = [
  {
    id: 'evs-qr',
    category: 'EVS Service Request & Patient Experience',
    name: 'EVS Service Request QR Codes',
    description: 'QR codes placed in public bathrooms, stairwells, ED, waiting rooms, and public areas',
    monthlyCost: 350
  },
  {
    id: 'unlimited-qr',
    category: 'EVS Service Request & Patient Experience',
    name: 'Unlimited QR Codes',
    description: 'Unlimited QR code creation across enterprise',
    monthlyCost: 0,
    isIncluded: true
  },
  {
    id: 'real-time-requests',
    category: 'EVS Service Request & Patient Experience',
    name: 'Real-Time Service Requests',
    description: 'Requests captured with photo, timestamp, and documentation',
    monthlyCost: 0,
    isIncluded: true
  },
  {
    id: 'setup-cost',
    category: 'Set Up Cost',
    name: 'User, account, notifications, etc',
    description: 'If the entire suite is not purchased.',
    monthlyCost: 0,
    setupFee: 250
  },
  {
    id: 'terminal-cleaning',
    category: 'Operations, Compliance & Regulatory',
    name: 'Terminal Cleaning Tracking',
    description: 'Tracks terminal cleaning for surgical and procedural spaces',
    monthlyCost: 350
  },
  {
    id: 'curtain-exchange',
    category: 'Operations, Compliance & Regulatory',
    name: 'Curtain Exchange & Inspection Tracking',
    description: 'Tracks curtain exchanges and regulatory inspections',
    monthlyCost: 350
  },
  {
    id: 'discharge-cleaning',
    category: 'Operations, Compliance & Regulatory',
    name: 'Discharge Cleaning Workflows',
    description: 'Standardized discharge cleaning workflows with inspection validation',
    monthlyCost: 350
  },
  {
    id: 'compliance-audit',
    category: 'Operations, Compliance & Regulatory',
    name: 'Compliance & Audit Documentation',
    description: 'Photo-validated compliance documentation',
    monthlyCost: 350
  },
  {
    id: 'machine-inventory',
    category: 'Inventory, Equipment & Asset Management',
    name: 'Machine Inventory & Usage Tracking',
    description: 'QR-based service records and usage logs',
    monthlyCost: 350
  },
  {
    id: 'equipment-lifespan',
    category: 'Inventory, Equipment & Asset Management',
    name: 'Equipment Life Span Meter',
    description: 'Tracks usage, lifecycle, and replacement planning',
    monthlyCost: 350
  },
  {
    id: 'supplies-analytics',
    category: 'Inventory, Equipment & Asset Management',
    name: 'Supplies Analytics',
    description: 'Shows where supplies are used across the facility',
    monthlyCost: 350
  },
  {
    id: 'mycleaning',
    category: 'Inventory, Equipment & Asset Management',
    name: 'MyCleaning Module',
    description: 'Tracks equipment, trash trucks, compactors, and support equipment',
    monthlyCost: 350
  },
  {
    id: 'phone-pager',
    category: 'Staff, Workflow & Accountability',
    name: 'Phone & Pager Sign-In/Sign-Out',
    description: 'Tracks staff device accountability',
    monthlyCost: 500
  },
  {
    id: 'mychecklist',
    category: 'Staff, Workflow & Accountability',
    name: 'MyChecklist Module',
    description: 'Routine workflows and floor care employee logs',
    monthlyCost: 350
  },
  {
    id: 'floor-care',
    category: 'Staff, Workflow & Accountability',
    name: 'Floor Care Sustainable Log',
    description: 'Logs burnishing and restorative floor care projects',
    monthlyCost: 350
  },
  {
    id: 'myorders',
    category: 'Supply Chain, Orders & Budget Controls',
    name: 'MyOrders Module',
    description: 'Tracks outpatient supply delivery and usage by hub',
    monthlyCost: 350
  },
  {
    id: 'budgets-location',
    category: 'Supply Chain, Orders & Budget Controls',
    name: 'Budgets by Location',
    description: 'Tracks actual supply spend by hospital/location',
    monthlyCost: 350
  },
  {
    id: 'expiration-monitoring',
    category: 'Safety, Expiration & Compliance',
    name: 'Expiration Monitoring',
    description: 'QR-based expiration tracking with automated alerts',
    monthlyCost: 125
  },
  {
    id: 'inventory-accountability',
    category: 'Safety, Expiration & Compliance',
    name: 'Inventory & Supply Accountability',
    description: 'Improves inventory control and compliance',
    monthlyCost: 350
  },
  {
    id: 'sla-tracker',
    category: 'Complaint Tracker',
    name: 'SLA tracker',
    description: 'Track complaints and trends on power BI',
    monthlyCost: 150
  },
  {
    id: 'sound-monitor',
    category: 'Noise Tracker',
    name: 'Sound Monitor',
    description: 'Monitor noise levels at accounts',
    monthlyCost: 500
  },
  {
    id: 'power-bi-dashboard',
    category: 'Enterprise Analytics & Reporting',
    name: 'Power BI Enterprise Dashboard',
    description: 'Executive, regional, and site-level reporting',
    monthlyCost: 150
  }
];
