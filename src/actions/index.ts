import { createPoll, lockPoll, unlockPoll, cancelPoll, uncancelPoll, inviteParticipants, deletePoll, bulkInvite, remindNonResponders, editPoll } from "./polls";
import { submitVote } from "./votes";
import { sendMagicLink } from "./auth";
import { sendAdminPush } from "./admin";

export const server = {
    createPoll,
    editPoll,
    lockPoll,
    unlockPoll,
    cancelPoll,
    uncancelPoll,
    inviteParticipants,
    deletePoll,
    bulkInvite,
    remindNonResponders,
    submitVote,
    sendMagicLink,
    sendAdminPush,
};
