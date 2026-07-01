import { AccountType, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../core/db/PrismaClient.js";

export class AuthRepository {
  findAccountByType(accountType: AccountType) {
    return prisma.twitchAccount.findFirst({
      where: { accountType },
      include: { oauthToken: true },
    });
  }

  findAccountByProviderUserId(providerUserId: string) {
    return prisma.twitchAccount.findUnique({
      where: { providerUserId },
      include: { oauthToken: true },
    });
  }

  async upsertAccountWithToken(params: {
    providerUserId: string;
    login: string;
    displayName: string;
    accountType: AccountType;
    accessToken: string;
    refreshToken: string;
    scopes: string[];
    expiresAt: Date;
  }) {
    const existing = await prisma.twitchAccount.findUnique({
      where: { providerUserId: params.providerUserId },
      include: { oauthToken: true },
    });

    if (!existing) {
      return prisma.twitchAccount.create({
        data: {
          providerUserId: params.providerUserId,
          login: params.login,
          displayName: params.displayName,
          accountType: params.accountType,
          oauthToken: {
            create: {
              accessToken: params.accessToken,
              refreshToken: params.refreshToken,
              scopes: params.scopes,
              expiresAt: params.expiresAt,
            },
          },
        },
        include: { oauthToken: true },
      });
    }

    return prisma.twitchAccount.update({
      where: { id: existing.id },
      data: {
        login: params.login,
        displayName: params.displayName,
        accountType: params.accountType,
        oauthToken: existing.oauthToken
          ? {
              update: {
                accessToken: params.accessToken,
                refreshToken: params.refreshToken,
                scopes: params.scopes,
                expiresAt: params.expiresAt,
              },
            }
          : {
              create: {
                accessToken: params.accessToken,
                refreshToken: params.refreshToken,
                scopes: params.scopes,
                expiresAt: params.expiresAt,
              },
            },
      },
      include: { oauthToken: true },
    });
  }

  updateTokenByAccountId(
    twitchAccountId: string,
    data: Prisma.OAuthTokenUpdateInput,
  ) {
    return prisma.oAuthToken.update({
      where: { twitchAccountId },
      data,
    });
  }

  findAllAccountsWithTokens() {
    return prisma.twitchAccount.findMany({
      include: { oauthToken: true },
      orderBy: { createdAt: "asc" },
    });
  }
}