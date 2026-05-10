import { createPoll, lockPoll, unlockPoll, cancelPoll, uncancelPoll, inviteParticipants, deletePoll, bulkInvite } from "./polls";
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
    bulkInvite,
    submitVote,
    sendMagicLink,
    sendAdminPush,
};
