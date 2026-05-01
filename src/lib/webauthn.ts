import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";

export type { VerifiedRegistrationResponse, VerifiedAuthenticationResponse };

export function toBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function getRpId(requestUrl: string): string {
  return new URL(requestUrl).hostname;
}

export function getRpOrigin(requestUrl: string): string {
  const u = new URL(requestUrl);
  return u.origin;
}

export async function createRegistrationOptions(opts: {
  userId: number;
  userEmail: string;
  existingCredentialIds: string[]; // base64url
  requestUrl: string;
}) {
  const rpID = getRpId(opts.requestUrl);
  return generateRegistrationOptions({
    rpName: "CommonTime",
    rpID,
    userName: opts.userEmail,
    userDisplayName: opts.userEmail,
    userID: new TextEncoder().encode(String(opts.userId)),
    attestationType: "none",
    excludeCredentials: opts.existingCredentialIds.map((id) => ({
      id,
      transports: ["internal"] as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: "required",       // discoverable credential
      userVerification: "preferred",
    },
  });
}

export async function createAuthenticationOptions(requestUrl: string) {
  const rpID = getRpId(requestUrl);
  return generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    // No allowCredentials — allows any discoverable credential for this rpID
  });
}

export async function verifyRegistration(opts: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  requestUrl: string;
}): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: getRpOrigin(opts.requestUrl),
    expectedRPID: getRpId(opts.requestUrl),
    requireUserVerification: false,
  });
}

export async function verifyAuthentication(opts: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: { credentialId: string; publicKey: string; signCount: number };
  requestUrl: string;
}): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: getRpOrigin(opts.requestUrl),
    expectedRPID: getRpId(opts.requestUrl),
    credential: {
      id: opts.credential.credentialId,
      publicKey: fromBase64url(opts.credential.publicKey),
      counter: opts.credential.signCount,
    },
    requireUserVerification: false,
  });
}
