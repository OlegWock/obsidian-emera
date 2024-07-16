import { ReactNode } from "react";

// We need this component to have stable reference at the root of mounted React trees
export const RootComponent = ({ factory }: {factory: () => ReactNode}) => {
    return (<>{factory()}</>);
};
