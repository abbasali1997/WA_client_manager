import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'path';
import fs from 'fs';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {}

  getCompanyName = (): string =>
    process.env.COMPANY_NAME?.trim() || '2N5 Global';

  getHealthAlertCopy = (language: string, companyName: string) => {
    const lang = (language || 'en').toLowerCase();

    if (lang === 'pt' || lang.startsWith('pt-')) {
      return {
        subject: `Alerta de saúde do WhatsApp - ${companyName}`,
        alertBadge: 'Alerta de Saúde',
        greeting: 'Olá',
        intro: `Detectamos um problema com uma sessão do WhatsApp vinculada à sua conta na ${companyName}. Sua sessão do WhatsApp pode não estar funcionando corretamente e requer atenção imediata.`,
        alertTitle: '⚠️ Problema Detectado',
        alertMessage:
          'Sua sessão do WhatsApp falhou em várias verificações de saúde consecutivas. Isso pode significar que sua conta foi desconectada, bloqueada ou está enfrentando problemas de conectividade.',
        detailsTitle: 'Detalhes da Sessão',
        sessionLabel: 'ID da Sessão',
        phoneLabel: 'Número de Telefone',
        nameLabel: 'Nome do WhatsApp',
        statusLabel: 'Status Atual',
        failuresLabel: 'Falhas Consecutivas',
        reasonLabel: 'Motivo do Erro',
        actionTitle: 'Ações Recomendadas',
        action1:
          'Faça login no painel para verificar o status da sua sessão do WhatsApp',
        action2: 'Reconecte sua conta do WhatsApp se necessário',
        action3:
          'Verifique se sua conta do WhatsApp não foi bloqueada ou suspensa',
        buttonLabel: 'Acessar Painel',
        supportText:
          'Se você precisar de ajuda ou tiver dúvidas, nossa equipe de suporte está disponível para ajudá-lo.',
        footerText: 'Atenciosamente,',
        team: `Equipe ${companyName}`,
      };
    }

    if (lang === 'es' || lang.startsWith('es-')) {
      return {
        subject: `Alerta de salud de WhatsApp - ${companyName}`,
        alertBadge: 'Alerta de Salud',
        greeting: 'Hola',
        intro: `Detectamos un problema con una sesión de WhatsApp vinculada a su cuenta en ${companyName}. Su sesión de WhatsApp puede no estar funcionando correctamente y requiere atención inmediata.`,
        alertTitle: '⚠️ Problema Detectado',
        alertMessage:
          'Su sesión de WhatsApp ha fallado en varias verificaciones de salud consecutivas. Esto puede significar que su cuenta ha sido desconectada, bloqueada o está experimentando problemas de conectividad.',
        detailsTitle: 'Detalles de la Sesión',
        sessionLabel: 'ID de Sesión',
        phoneLabel: 'Número de Teléfono',
        nameLabel: 'Nombre de WhatsApp',
        statusLabel: 'Estado Actual',
        failuresLabel: 'Fallos Consecutivos',
        reasonLabel: 'Motivo del Error',
        actionTitle: 'Acciones Recomendadas',
        action1:
          'Inicie sesión en el panel para verificar el estado de su sesión de WhatsApp',
        action2: 'Reconecte su cuenta de WhatsApp si es necesario',
        action3:
          'Verifique si su cuenta de WhatsApp no ha sido bloqueada o suspendida',
        buttonLabel: 'Acceder al Panel',
        supportText:
          'Si necesita ayuda o tiene preguntas, nuestro equipo de soporte está disponible para ayudarle.',
        footerText: 'Atentamente,',
        team: `Equipo ${companyName}`,
      };
    }

    if (lang === 'fr' || lang.startsWith('fr-')) {
      return {
        subject: `Alerte de santé WhatsApp - ${companyName}`,
        alertBadge: 'Alerte de Santé',
        greeting: 'Bonjour',
        intro: `Nous avons détecté un problème avec une session WhatsApp liée à votre compte sur ${companyName}. Votre session WhatsApp peut ne pas fonctionner correctement et nécessite une attention immédiate.`,
        alertTitle: '⚠️ Problème Détecté',
        alertMessage:
          'Votre session WhatsApp a échoué à plusieurs vérifications de santé consécutives. Cela peut signifier que votre compte a été déconnecté, bloqué ou rencontre des problèmes de connectivité.',
        detailsTitle: 'Détails de la Session',
        sessionLabel: 'ID de Session',
        phoneLabel: 'Numéro de Téléphone',
        nameLabel: 'Nom WhatsApp',
        statusLabel: 'Statut Actuel',
        failuresLabel: 'Échecs Consécutifs',
        reasonLabel: "Raison de l'Erreur",
        actionTitle: 'Actions Recommandées',
        action1:
          "Connectez-vous au tableau de bord pour vérifier l'état de votre session WhatsApp",
        action2: 'Reconnectez votre compte WhatsApp si nécessaire',
        action3:
          "Vérifiez si votre compte WhatsApp n'a pas été bloqué ou suspendu",
        buttonLabel: 'Accéder au Tableau de Bord',
        supportText:
          "Si vous avez besoin d'aide ou avez des questions, notre équipe de support est disponible pour vous aider.",
        footerText: 'Cordialement,',
        team: `Équipe ${companyName}`,
      };
    }

    if (lang === 'de' || lang.startsWith('de-')) {
      return {
        subject: `WhatsApp-Gesundheitsalarm - ${companyName}`,
        alertBadge: 'Gesundheitsalarm',
        greeting: 'Hallo',
        intro: `Wir haben ein Problem mit einer WhatsApp-Sitzung festgestellt, die mit Ihrem Konto auf ${companyName} verknüpft ist. Ihre WhatsApp-Sitzung funktioniert möglicherweise nicht ordnungsgemäß und erfordert sofortige Aufmerksamkeit.`,
        alertTitle: '⚠️ Problem Erkannt',
        alertMessage:
          'Ihre WhatsApp-Sitzung ist bei mehreren aufeinanderfolgenden Gesundheitsprüfungen fehlgeschlagen. Dies kann bedeuten, dass Ihr Konto getrennt, blockiert wurde oder Verbindungsprobleme aufweist.',
        detailsTitle: 'Sitzungsdetails',
        sessionLabel: 'Sitzungs-ID',
        phoneLabel: 'Telefonnummer',
        nameLabel: 'WhatsApp-Name',
        statusLabel: 'Aktueller Status',
        failuresLabel: 'Aufeinanderfolgende Fehler',
        reasonLabel: 'Fehlergrund',
        actionTitle: 'Empfohlene Maßnahmen',
        action1:
          'Melden Sie sich im Dashboard an, um den Status Ihrer WhatsApp-Sitzung zu überprüfen',
        action2: 'Verbinden Sie Ihr WhatsApp-Konto bei Bedarf erneut',
        action3:
          'Überprüfen Sie, ob Ihr WhatsApp-Konto nicht blockiert oder gesperrt wurde',
        buttonLabel: 'Zum Dashboard',
        supportText:
          'Wenn Sie Hilfe benötigen oder Fragen haben, steht Ihnen unser Support-Team zur Verfügung.',
        footerText: 'Mit freundlichen Grüßen,',
        team: `${companyName}-Team`,
      };
    }

    // Default to English
    return {
      subject: `WhatsApp Health Alert - ${companyName}`,
      alertBadge: 'Health Alert',
      greeting: 'Hello',
      intro: `We detected an issue with a WhatsApp session linked to your account on ${companyName}. Your WhatsApp session may not be functioning properly and requires immediate attention.`,
      alertTitle: '⚠️ Issue Detected',
      alertMessage:
        'Your WhatsApp session has failed multiple consecutive health checks. This may mean your account has been disconnected, blocked, or is experiencing connectivity issues.',
      detailsTitle: 'Session Details',
      sessionLabel: 'Session ID',
      phoneLabel: 'Phone Number',
      nameLabel: 'WhatsApp Name',
      statusLabel: 'Current Status',
      failuresLabel: 'Consecutive Failures',
      reasonLabel: 'Error Reason',
      actionTitle: 'Recommended Actions',
      action1: 'Log in to the dashboard to check your WhatsApp session status',
      action2: 'Reconnect your WhatsApp account if necessary',
      action3:
        'Verify that your WhatsApp account has not been blocked or suspended',
      buttonLabel: 'Access Dashboard',
      supportText:
        'If you need assistance or have any questions, our support team is available to help you.',
      footerText: 'Best regards,',
      team: `${companyName} Team`,
    };
  };

  getFrontendUrl = (): string => {
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) {
      return 'https://system.2n5global.com';
    }
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  };

  async sendWhatsAppHealthAlert(
    toEmail: string,
    data: {
      sessionId: string;
      phoneNumber?: string;
      whatsappName?: string;
      lastHealthStatus?: string;
      consecutiveFailures?: number;
      reason?: string;
      language?: string;
    },
  ): Promise<void> {
    try {
      const fromName =
        this.configService.get<string>('email.from.name') || '2N5';
      const fromAddress = this.configService.get<string>('email.from.address');
      const companyName = this.getCompanyName();
      const supportEmail =
        this.configService.get<string>('support.email') ||
        this.configService.get<string>('email.from.address') ||
        'support@2n5global.com';
      const languageCode =
        data.language ||
        this.configService.get<string>('email.defaultLanguage') ||
        'en';
      const copy = this.getHealthAlertCopy(languageCode, companyName);

      const template = this.loadTemplate('whatsapp-alert');
      const templateData = {
        ...copy,
        companyName,
        supportEmail,
        sessionId: data.sessionId,
        phoneNumber: data.phoneNumber,
        whatsappName: data.whatsappName,
        lastHealthStatus: data.lastHealthStatus || 'failed',
        consecutiveFailures: data.consecutiveFailures,
        reason: data.reason,
        loginUrl: this.getFrontendUrl() + '/login',
      };

      const html = template(templateData);

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: toEmail,
        subject: copy.subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `WhatsApp health alert sent to ${toEmail} for session ${data.sessionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp health alert to ${toEmail}:`,
        error,
      );
    }
  }

  private loadTemplate(templateId: string): handlebars.TemplateDelegate {
    try {
      const templatePath = path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'templates',
        `${templateId}.hbs`,
      );
      this.logger.debug(`Loading email template: path=${templatePath}`);
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      this.logger.debug(
        `Email template loaded: templateId=${templateId}, length=${templateContent.length}`,
      );
      return handlebars.compile(templateContent);
    } catch (error) {
      this.logger.error(`Failed to load template ${templateId}:`, error);
      // Return a default template if the specific template is not found
      return handlebars.compile(`
        <html>
          <body>
            <h1>Welcome to 2N5</h1>
            <p>Hello {{firstName}} {{lastName}},</p>
            <p>Welcome to 2N5 platform!</p>
            <p>Best regards,<br>The 2N5 Team</p>
          </body>
        </html>
      `);
    }
  }
}
