import { getApp, getApps } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../config/firebase';

const app = getApps().length ? getApp() : firebaseApp;
const functions = getFunctions(app, 'us-central1');

export const callAnalyzeSummary = httpsCallable(functions, 'analyzeSummary');
export const callParseTransactionPhrase = httpsCallable(functions, 'parseTransactionPhrase');
export const callTranscribeAudio = httpsCallable(functions, 'transcribeAudio');
export const callGetUserProfile = httpsCallable(functions, 'getUserProfile');
export const callSetUserOpenAIKey = httpsCallable(functions, 'setUserOpenAIKey');
export const callClearUserOpenAIKey = httpsCallable(functions, 'clearUserOpenAIKey');
export const callSetUserKeyPreference = httpsCallable(functions, 'setUserKeyPreference');
export const callSetUserRole = httpsCallable(functions, 'setUserRole');
export const callListUsers = httpsCallable(functions, 'listUsers');
export const callRegisterUserEntry = httpsCallable(functions, 'registerUserEntry');
export const callGetUsageQuota = httpsCallable(functions, 'getUsageQuota');
export const callGetPlans = httpsCallable(functions, 'getPlans');
export const callCreateWompiCheckout = httpsCallable(functions, 'createWompiCheckout');
export const callSetAdvisorMode = httpsCallable(functions, 'setAdvisorMode');
export const callAnalyzeMonthlyDeep = httpsCallable(functions, 'analyzeMonthlyDeep');
