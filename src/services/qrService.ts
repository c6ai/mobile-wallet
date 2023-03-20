import { CredentialResponse, IssuanceInitiation } from '@sphereon/openid4vci-client'
import { ConnectionTypeEnum, CorrelationIdentifierEnum, IContact } from '@sphereon/ssi-sdk-data-store'
import { CredentialMapper } from '@sphereon/ssi-types'
import { VerifiableCredential } from '@veramo/core'
import Debug from 'debug'
import { URL } from 'react-native-url-polyfill'

import { APP_ID } from '../@config/constants'
import { translate } from '../localization/Localization'
import JwtVcPresentationProfileProvider
  from '../providers/credential/JwtVcPresentationProfileProvider'
import OpenId4VcIssuanceProvider from '../providers/credential/OpenId4VcIssuanceProvider'
import store from '../store'
import { storeVerifiableCredential } from '../store/actions/credential.actions'
import {
  ICredentialMetadata,
  ICredentialTypeSelection,
  IErrorDetails,
  IQrAuthentication,
  IQrData,
  IQrDataArgs,
  IQrDidSiopAuthenticationRequest,
  IReadQrArgs,
  IServerMetadataAndCryptoMatchingResponse,
  NavigationBarRoutesEnum,
  PopupImagesEnum,
  QrTypesEnum,
  ScreenRoutesEnum,
  ToastTypeEnum
} from '../types'
import { showToast } from '../utils/ToastUtils'
import { toCredentialSummary } from '../utils/mappers/CredentialMapper'

import { authenticate } from './authenticationService'
import { getContacts, identityFrom } from './contactService'
import { getOrCreatePrimaryIdentifier } from './identityService'

const { v4: uuidv4 } = require('uuid')

const debug = Debug(`${APP_ID}:qrService`)

export const readQr = async (args: IReadQrArgs): Promise<void> => {
  parseQr(args.qrData)
    .then((qrData: IQrData) => processQr({ qrData, navigation: args.navigation }))
    .catch((error: Error) => showToast(ToastTypeEnum.TOAST_ERROR, error.message))
}

export const parseQr = async (qrData: string): Promise<IQrData> => {
  try {
    const parsedJson = JSON.parse(qrData)
    if (parsedJson && typeof parsedJson === 'object') {
      return parsedJson
    }
  } catch (error: unknown) {
    debug(`Unable to parse QR value as JSON. Error: ${error}`)
  }

  try {
    const param = new URL(qrData).searchParams.get('oob')
    if (param) {
      const iQr = {
        ...JSON.parse(Buffer.from(param, 'base64').toString('utf8')),
        redirectUrl: qrData
      }
      return iQr
    }
  } catch (error: unknown) {
    debug(`Unable to parse QR value as URL. Error: ${error}`)
  }

  if (qrData.startsWith(QrTypesEnum.OPENID_INITIATE_ISSUANCE)) {
    try {
      return parseOpenID4VCI(qrData)
    } catch (error: unknown) {
      debug(`Unable to parse QR value as openid-initiate-issuance. Error: ${error}`)
    }
  } else if (qrData.startsWith(QrTypesEnum.OPENID_VC) || qrData.startsWith(QrTypesEnum.OPENID)) {
    try {
      return parseSIOPv2(qrData)
    } catch (error: unknown) {
      debug(`Unable to parse QR value as openid-vc. Error: ${error}`)
    }
  }

  return Promise.reject(Error(translate('qr_scanner_qr_not_supported_message')))
}

const parseSIOPv2 = (qrData: string): Promise<IQrData> => {
  try {
    return Promise.resolve({
      type: QrTypesEnum.OPENID_VC,
      uri: qrData
    })
  } catch (error: unknown) {
    return Promise.reject(error)
  }
}

const parseOpenID4VCI = (qrData: string): Promise<IQrData> => {
  try {
    return Promise.resolve({
      type: QrTypesEnum.OPENID_INITIATE_ISSUANCE,
      issuanceInitiation: IssuanceInitiation.fromURI(qrData),
      uri: qrData
    })
  } catch (error: unknown) {
    return Promise.reject(error)
  }
}

export const processQr = async (args: IQrDataArgs): Promise<void> => {
  switch (args.qrData.type) {
    case QrTypesEnum.AUTH:
      switch ((args.qrData as IQrAuthentication).mode) {
        case ConnectionTypeEnum.SIOPv2:
          return connectDidAuth(args)
      }
      break
    case QrTypesEnum.SIOPV2:
    case QrTypesEnum.OPENID_VC:
      return connectSiopV2(args)
    case QrTypesEnum.OPENID_INITIATE_ISSUANCE:
      return connectOpenId4VcIssuance(args)
  }
}

const connectDidAuth = async (args: IQrDataArgs): Promise<void> => {
  const identifier = await getOrCreatePrimaryIdentifier() // TODO replace getOrCreatePrimaryIdentifier() when we have proper identities in place
  const identity = identityFrom({ // TODO identity ipv connection
    alias: new URL(args.qrData.uri.split('?')[0]).host,
    identifier: {
      type: CorrelationIdentifierEnum.DID,
      correlationId: identifier.did
    },
    connection: {
      type: ConnectionTypeEnum.SIOPv2,
      config: {
        identifier,
        stateId: (args.qrData as IQrDidSiopAuthenticationRequest).state,
        redirectUrl: (args.qrData as IQrDidSiopAuthenticationRequest).redirectUrl,
        sessionId: (args.qrData as IQrDidSiopAuthenticationRequest).redirectUrl + identifier.did
      }
    }
  })

  authenticate(identity)
    .then(() => console.log('authentication success'))
    .catch((error) => {
      if (!/UserCancel|UserFallback|SystemCancel/.test(error.name)) {
        console.error('Error', error)
      }
    })
}

const connectSiopV2 = async (args: IQrDataArgs): Promise<void> => {
  args.navigation.navigate(ScreenRoutesEnum.IDENTITY_DETAILS, {
    identity: identityFrom({
      alias: new URL(args.qrData.uri.split('?')[0]).host, // fixme: do this on the request_uri value
      identifier: {
        type: CorrelationIdentifierEnum.URL,
        correlationId: args.qrData.uri
      },
      connection: {
        type: ConnectionTypeEnum.SIOPv2_OpenID4VP,
        config: {
          // FIXME: Update these values in SSI-SDK. Only the URI (not a redirectURI) would be available at this point
          sessionId: args.qrData.id,
          redirectUrl: args.qrData.uri,
          stateId: args.qrData.state,
          identifier: await getOrCreatePrimaryIdentifier() // TODO replace getOrCreatePrimaryIdentifier() when we have proper identities in place
        },
      },
      metadata: [
        {
          label: translate('metadata_purpose_label'),
          value: translate('siop_oidc4vp_authentication_request_message')
        },
        {
          label: translate('metadata_rp_did_label'),
          value: args.qrData.from
        },
        {
          label: translate('metadata_connection_url_label'),
          value: decodeURIComponent(args.qrData.uri.split('?request_uri=')[1])
        }
      ]
    })
  })
}

const connectJwtVcPresentationProfile = async (args: IQrDataArgs): Promise<void> => {
  if (args.qrData.pin) {
    const manifest = await new JwtVcPresentationProfileProvider().getManifest(args.qrData)
    args.navigation.navigate(ScreenRoutesEnum.VERIFICATION_CODE, {
      pinLength: args.qrData.pin.length,
      credentialName: manifest.display.card.title || '[MISSING CREDENTIAL NAME]', // TODO translate
      // TODO WAL-301 need to send a response with a pin code to complete the process.
      onVerification: async (pin: string) =>
        await args.navigation.navigate(NavigationBarRoutesEnum.CREDENTIALS, {
          screen: ScreenRoutesEnum.CREDENTIALS_OVERVIEW
        })
    })
  }
  // TODO WAL-301 need to send a response when we do not need a pin code
}


const connectOpenId4VcIssuance = async (args: IQrDataArgs): Promise<void> => {
  const sendResponseOrCreateContact = async (metadata: IServerMetadataAndCryptoMatchingResponse): Promise<void> => {
    const url = new URL(metadata.serverMetadata.issuer)
    getContacts({ filter: [{
      identities: {
        identifier: {
          correlationId: url.hostname
        }
      }
    }]}).then(
      (contacts: Array<IContact>) => {
        if (contacts.length === 0) {
          args.navigation.navigate(ScreenRoutesEnum.CONTACT_ADD, {
            name: url.host,
            uri: `${url.protocol}//${url.hostname}`,
            identifier: {
              type: CorrelationIdentifierEnum.URL,
              correlationId: url.hostname
            },
            onCreate: () => sendResponseOrSelectCredentials(metadata.credentialsSupported)
          })
        } else {
          sendResponseOrSelectCredentials(metadata.credentialsSupported)
        }
      }
    )
  }

  const sendResponseOrSelectCredentials = async (credentialsSupported: Array<ICredentialMetadata>): Promise<void> => {
    const credentialTypes: Array<ICredentialTypeSelection> = credentialsSupported.map(
      (credentialMetadata: ICredentialMetadata) => ({
        id: uuidv4(),
        credentialType: credentialMetadata.credentialType,
        isSelected: true
      })
    )

    if (credentialTypes.length > 1) {
      args.navigation.navigate(ScreenRoutesEnum.CREDENTIAL_SELECT_TYPE, {
        issuer: args.qrData.issuanceInitiation.issuanceInitiationRequest.issuer,
        credentialTypes: credentialsSupported.map((credentialMetadata: ICredentialMetadata) => ({
          id: uuidv4(),
          credentialType: credentialMetadata.credentialType,
          isSelected: true
        })),
        onAccept: async (credentialTypes: Array<string>) => await sendResponseOrAuthenticate(credentialTypes)
      })
    } else {
      await sendResponseOrAuthenticate(
        credentialTypes.map((credentialSelection: ICredentialTypeSelection) => credentialSelection.credentialType)
      )
    }
  }

  const sendResponseOrAuthenticate = async (credentials: Array<string>): Promise<void> => {
    if (
      args.qrData.issuanceInitiation.issuanceInitiationRequest.user_pin_required === 'true' ||
      args.qrData.issuanceInitiation.issuanceInitiationRequest.user_pin_required === true
    ) {
      args.navigation.navigate(NavigationBarRoutesEnum.QR, {
        screen: ScreenRoutesEnum.VERIFICATION_CODE,
        params: {
          // Currently we only support receiving one credential, we are missing ui to display multiple
          credentialName: credentials[0],
          onVerification: async (pin: string) => await sendResponse(provider, pin)
        }
      })
    } else {
      await sendResponse(provider)
    }
  }

  const sendResponse = async (provider: OpenId4VcIssuanceProvider, pin?: string): Promise<void> =>
    provider
      .getCredentialsFromIssuance({ pin })
      .then((credentialsResponse: Record<string, CredentialResponse>) => {
        for (const credentialResponse of Object.values(credentialsResponse)) {
          const vc = CredentialMapper.toUniformCredential(credentialResponse.credential)
          const rawCredential = credentialResponse.credential as unknown as VerifiableCredential
          // TODO fix the store not having the correct action types (should include ThunkAction)
          const storeCredential = async (vc: VerifiableCredential) => store.dispatch<any>(storeVerifiableCredential(vc))

          // We are specifically navigating to a stack, so that when a deeplink is used the navigator knows in which stack it is
          args.navigation.navigate(NavigationBarRoutesEnum.QR, {
            screen: ScreenRoutesEnum.CREDENTIAL_DETAILS,
            params: {
              rawCredential,
              credential: toCredentialSummary(vc),
              primaryAction: {
                caption: translate('action_accept_label'),
                onPress: async () =>
                  storeCredential(rawCredential)
                    .then(() =>
                      args.navigation.navigate(NavigationBarRoutesEnum.CREDENTIALS, {
                        screen: ScreenRoutesEnum.CREDENTIALS_OVERVIEW
                      })
                    )
                    .then(() => showToast(ToastTypeEnum.TOAST_SUCCESS, translate('credential_offer_accepted_toast')))
                    .catch((error: Error) => showToast(ToastTypeEnum.TOAST_ERROR, error.message))
              },
              secondaryAction: {
                caption: translate('action_decline_label'),
                onPress: async () => args.navigation.navigate(ScreenRoutesEnum.QR_READER)
              }
            }
          })
        }
      })
      .catch((error: Error) => {
        // TODO refactor once the lib returns a proper response object
        const errorResponse = error.message.includes('response:')
          ? JSON.parse(error.message.split('response:')[1].trim())
          : error.message
        if (error.message.includes('403') || errorResponse.status === 403) {
          return Promise.reject(error)
        }
        const errorDetails: IErrorDetails = OpenId4VcIssuanceProvider.getErrorDetails(errorResponse.error)

        args.navigation.navigate(ScreenRoutesEnum.ERROR, {
          image: PopupImagesEnum.WARNING,
          title: errorDetails.title,
          details: errorDetails.message,
          detailsPopup: {
            buttonCaption: translate('action_view_extra_details'),
            title: errorDetails.detailsTitle,
            details: `${errorDetails.detailsMessage} ${errorResponse.error_description}`
          },
          primaryButton: {
            caption: translate('action_ok_label'),
            onPress: async () => args.navigation.navigate(ScreenRoutesEnum.QR_READER, {})
          }
        })
      })

  const provider = await OpenId4VcIssuanceProvider.initiationFromUri({ uri: args.qrData.uri })
  provider
    .getServerMetadataAndPerformCryptoMatching()
    .then((metadata: IServerMetadataAndCryptoMatchingResponse) => sendResponseOrCreateContact(metadata))
    .catch((error: Error) => {
      debug(`Unable to retrieve vc. Error: ${error}`)
      //TODO create human readable error message
      showToast(ToastTypeEnum.TOAST_ERROR, error.message)
    })
}
