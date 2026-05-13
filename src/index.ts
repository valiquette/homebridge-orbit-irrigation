import type { API } from 'homebridge';
import { PLATFORM_NAME } from './settings.js';
import  OrbitPlatform  from './orbitplatform.js';

export default (api: API) => {
	api.registerPlatform(PLATFORM_NAME, OrbitPlatform);
};