import { sendFCMNotificationMutation } from "../services/fcmService";

const notificationResolvers = {
  Mutation: {
    sendFCMNotification: sendFCMNotificationMutation,
  },
};

export default notificationResolvers;
