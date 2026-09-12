import { useRef } from 'react';
import { getDefaultMMKVInstance } from '../createMMKV/getDefaultMMKVInstance';
import { createMMKV } from '../createMMKV/createMMKV';
function isConfigurationEqual(left, right) {
    if (left == null || right == null)
        return left == null && right == null;
    return (left.encryptionKey === right.encryptionKey &&
        left.encryptionType === right.encryptionType &&
        left.id === right.id &&
        left.path === right.path &&
        left.mode === right.mode &&
        left.readOnly === right.readOnly &&
        left.compareBeforeSet === right.compareBeforeSet &&
        left.recoveryStrategy === right.recoveryStrategy);
}
export function useMMKV(configuration) {
    const instance = useRef(undefined);
    const lastConfiguration = useRef(undefined);
    if (configuration == null)
        return getDefaultMMKVInstance();
    if (instance.current == null ||
        !isConfigurationEqual(lastConfiguration.current, configuration)) {
        lastConfiguration.current = configuration;
        instance.current = createMMKV(configuration);
    }
    return instance.current;
}
