import { createPoll, lockPoll, inviteParticipants } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";

export const server = {
    createPoll,
    lockPoll,
    inviteParticipants,
    submitVote,
    sendMagicLink,
};
