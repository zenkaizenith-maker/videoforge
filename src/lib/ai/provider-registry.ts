import type { AIProvider, ProviderKind } from "@/lib/providers/contracts";

export interface ProviderRegistry {
  get(kind: ProviderKind): AIProvider | undefined;
}

export function createProviderRegistry(providers: AIProvider[]): ProviderRegistry {
  return { get: (kind) => providers.find((provider) => provider.kind === kind) };
}
