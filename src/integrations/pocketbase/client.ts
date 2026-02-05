import PocketBase from 'pocketbase';

// URL PocketBase lokal (default)
const PB_URL = 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);

// Matikan validasi auto-cancellation untuk React Query stability
pb.autoCancellation(false);
