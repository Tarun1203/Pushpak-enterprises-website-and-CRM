export const __calls = [];
export const __handlers = {};
export const getFunctions = () => ({});
export const httpsCallable = (f, name) => async (data) => { __calls.push([name, data]); return { data: __handlers[name] ? await __handlers[name](data) : {} }; };
