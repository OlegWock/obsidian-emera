import { ReactNode, useMemo } from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";


export const ErrorAlert = ({ error }: { error: any }) => {
    const stack = useMemo(() => {
        if (error instanceof Error) {
            return error.stack?.replace(/\(data:text\/javascript;charset=utf-8,.+\)(?=\n)/gmi, '(your code)') ?? `${error.name}: ${error.message}`;
        }
        return '';
    }, [error]);
    return <div className="emera-error-boundary">
        <div>Error happened while rendering Emera component.</div>
        <div className="emera-error-description">
            {stack ? <pre>{stack}</pre> : String(error)}
        </div>
    </div>;
}

export const ErrorBoundary = ({ children }: { children?: ReactNode }) => {
    return (<ReactErrorBoundary FallbackComponent={ErrorAlert}>
        {children}
    </ReactErrorBoundary>)
};
