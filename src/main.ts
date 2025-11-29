import './index.css';
import App from './App.svelte';

// Mount the Svelte app to the root element
const appElement = document.getElementById('app');
if (!appElement) {
  throw new Error("Could not find root element to mount to");
}

// Create and mount the App component
const app = new App({
  target: appElement,
});

export default app;

