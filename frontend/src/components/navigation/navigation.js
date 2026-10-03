import {
  Activity, BarChart3, CloudSun, Droplets, FlaskConical, Gauge, Leaf, LineChart, ShieldAlert, Sprout, Wheat
} from 'lucide-react';

export const navigationGroups = [
  {
    label: 'Your workspace',
    links: [
      { label: 'Dashboard', to: '/app/dashboard', icon: Gauge, end: true },
      { label: 'My farms', to: '/app/farms', icon: Sprout, end: true }
    ]
  },
  {
    label: 'Farm decisions',
    links: [
      { label: 'Crop recommendation', to: '/app/crop-recommendation', icon: Leaf },
      { label: 'Irrigation', to: '/app/irrigation', icon: Droplets },
      { label: 'Fertilizer', to: '/app/fertilizer', icon: FlaskConical },
      { label: 'Disease detection', to: '/app/disease-detection', icon: ShieldAlert },
      { label: 'Disease risk', to: '/app/disease-risk', icon: Activity }
    ]
  },
  {
    label: 'Conditions & insights',
    links: [
      { label: 'Weather', to: '/app/weather', icon: CloudSun },
      { label: 'Market intelligence', to: '/app/market', icon: BarChart3 },
      { label: 'Crop ranking', to: '/app/crop-ranking', icon: Wheat },
      { label: 'Farm evaluation', to: '/app/evaluation', icon: LineChart }
    ]
  }
];
