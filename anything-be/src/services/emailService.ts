export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  /**
   * MSG91 template ID to use (optional).
   * When provided, `variables` will be sent as template variables.
   */
  templateId?: string;
  /**
   * Template variables for MSG91 (optional).
   */
  variables?: Record<string, unknown>;
}

const MSG91_EMAIL_API_URL =
  process.env.MSG91_EMAIL_API_URL ?? "https://api.msg91.com/api/v5/email/send";
const MSG91_EMAIL_AUTH_KEY = process.env.MSG91_EMAIL_AUTH_KEY;
const MSG91_EMAIL_FROM_EMAIL = process.env.MSG91_EMAIL_FROM_EMAIL;
const MSG91_EMAIL_FROM_NAME =
  process.env.MSG91_EMAIL_FROM_NAME ?? "Anything AI";
const MSG91_EMAIL_DOMAIN = process.env.MSG91_EMAIL_DOMAIN;

const sendMsg91Email = async (options: EmailOptions): Promise<boolean> => {
  try {
    if (!MSG91_EMAIL_AUTH_KEY) {
      console.error(
        "MSG91 email config error: MSG91_EMAIL_AUTH_KEY is not set."
      );
      return false;
    }

    if (!MSG91_EMAIL_FROM_EMAIL || !MSG91_EMAIL_DOMAIN) {
      console.error(
        "MSG91 email config error: MSG91_EMAIL_FROM_EMAIL or MSG91_EMAIL_DOMAIN is not set."
      );
      return false;
    }

    const payload: any = {
      to: [
        {
          email: options.to,
        },
      ],
      from: {
        email: MSG91_EMAIL_FROM_EMAIL,
        name: MSG91_EMAIL_FROM_NAME,
      },
      domain: MSG91_EMAIL_DOMAIN,
    };

    if (options.templateId) {
      payload.template_id = options.templateId;
      if (options.variables) {
        payload.variables = options.variables;
      }
    } else {
      payload.subject = options.subject;

      const body: any = {};
      if (options.html) {
        body.type = "html";
        body.data = options.html;
      } else if (options.text) {
        body.type = "text";
        body.data = options.text;
      }

      if (!body.type || !body.data) {
        console.error(
          "MSG91 email error: neither HTML nor text content was provided."
        );
        return false;
      }

      payload.body = body;
    }

    const response = await fetch(MSG91_EMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_EMAIL_AUTH_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        "MSG91 email API responded with non-OK status",
        response.status,
        errorText
      );
      return false;
    }

    const data = await response.json().catch(() => null);
    console.log("MSG91 email sent successfully", data);

    return true;
  } catch (error) {
    console.error("Failed to send email via MSG91:", error);
    return false;
  }
};

export const sendOTPEmail = async (
  email: string,
  otp: string
): Promise<boolean> => {
  const templateId = process.env.MSG91_EMAIL_OTP_TEMPLATE_ID;

  const subject = "Your Anything AI OTP";
  const html = `<p>Your OTP for Anything AI is <strong>${otp}</strong>. If you did not request this, please ignore this email.</p>`;

  return sendMsg91Email({
    to: email,
    subject,
    html,
    templateId: templateId || undefined,
    variables: templateId
      ? {
          otp,
        }
      : undefined,
  });
};

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  return sendMsg91Email(options);
};
