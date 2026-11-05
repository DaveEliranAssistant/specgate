import {WAITLIST_CONSENT_ERROR,WAITLIST_EMAIL_ERROR} from './messages.mjs';
const EMAIL_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(value){return value.normalize('NFKC').trim().toLowerCase();}
export function validateWaitlistInput(input){
 if(typeof input!=='object'||input===null||Array.isArray(input))return {ok:false,fields:{email:WAITLIST_EMAIL_ERROR,consent:WAITLIST_CONSENT_ERROR}};
 if(typeof input.company_website==='string'&&input.company_website.trim().length>0)return {ok:true,honeypot:true};
 const fields={},email=typeof input.email==='string'?normalizeEmail(input.email):'';
 if(email.length===0||email.length>254||!EMAIL_PATTERN.test(email))fields.email=WAITLIST_EMAIL_ERROR;
 if(input.consent!==true)fields.consent=WAITLIST_CONSENT_ERROR;
 if(Object.keys(fields).length>0)return {ok:false,fields};
 return {ok:true,honeypot:false,signup:{email,consent:true}};
}
