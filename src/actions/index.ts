import { createPoll, lockPoll, unlockPoll, inviteParticipants } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";

export const server = {
    createPoll,
    lockPoll,
    unlockPoll,
    inviteParticipants,
    submitVote,
    sendMagicLink,
};
