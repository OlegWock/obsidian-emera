export const safeCall = (cb: VoidFunction) => {
    try {
        cb();
    } catch (err) {
        console.log(err);
    }
};

export const iife = <T>(cb: () => T): T => {
    return cb();
};
