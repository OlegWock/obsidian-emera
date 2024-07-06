import { createContext, useContext } from "react"

const missingProvider = Symbol();

export const createStrictContext = <T,>(name: string) => {
  const ctx = createContext<T>(missingProvider as unknown as T);
  ctx.displayName = name;

  const useCtx = () => {
    const val = useContext(ctx);
    if (val === missingProvider as unknown as T) {
      throw new Error(`Missing context provider for ${name}`);
    }

    return val;
  }

  return [ctx.Provider, useCtx] as const;
};
