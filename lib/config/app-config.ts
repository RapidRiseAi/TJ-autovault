export const appConfig = {
  appName: 'autovault',
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  uploads: {
    maxUploadSizeMb: 10,
    allowedImageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedPdfMimeTypes: ['application/pdf'],
    maxImagesPerJobByTier: {
      free: 8,
      standard: 20,
      premium: 50
    }
  },
  subscriptions: {
    customerTiers: {
      free: { maxVehicles: 1, historyJobsLimit: 3, attachmentCapPerJob: 8 },
      standard: { maxVehicles: 3, historyJobsLimit: null, attachmentCapPerJob: 20 },
      premium: { maxVehicles: 10, historyJobsLimit: null, attachmentCapPerJob: 50 }
    },
    workshopPlans: {
      free: { watermarkRequired: true },
      growth: { watermarkRequired: false },
      enterprise: { watermarkRequired: false }
    }
  },
  branding: {
    defaultWatermarkEnabled: true,
    defaultWatermarkText: 'Powered by Rapid Rise AI'
  },
  email: {
    from: process.env.RESEND_FROM_EMAIL ?? 'AutoVault <noreply@example.com>'
  }
} as const;
