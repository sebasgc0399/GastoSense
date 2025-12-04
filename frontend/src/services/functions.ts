import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(getApp(), 'us-central1');

export const callAnalyzeSummary = httpsCallable(functions, 'analyzeSummary');
export const callParseTransactionPhrase = httpsCallable(functions, 'parseTransactionPhrase');
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
