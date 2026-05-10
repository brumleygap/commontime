import { createPoll, lockPoll, unlockPoll, cancelPoll, uncancelPoll, inviteParticipants, deletePoll } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";
import { sendAdminPush } from "./admin";

export const server = {
    createPoll,
    lockPoll,
    unlockPoll,
    cancelPoll,
    uncancelPoll,
    inviteParticipants,
    deletePoll,
    submitVote,
    sendMagicLink,
    sendAdminPush,
};
