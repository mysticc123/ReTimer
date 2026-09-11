import { AppState } from 'react-native';
const registeredInstances = new WeakSet();
export function addContentChangedListener(mmkv) {
    if (registeredInstances.has(mmkv)) {
        return;
    }
    registeredInstances.add(mmkv);
    if (global.WeakRef != null && global.FinalizationRegistry != null) {
        const weakMmkv = new WeakRef(mmkv);
        const listener = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                weakMmkv.deref()?.checkContentChanged();
            }
        });
        const finalization = new FinalizationRegistry((l) => {
            l.remove();
        });
        finalization.register(mmkv, listener);
    }
    else {
        AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                mmkv.checkContentChanged();
            }
        });
    }
}
