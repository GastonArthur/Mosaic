import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',workers:1,use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',headless:true},webServer:{command:'npx vite preview --host 127.0.0.1 --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:true}});

