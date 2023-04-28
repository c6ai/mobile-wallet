import {ActivityIndicator} from 'react-native';
import styled from 'styled-components/native';

import {SSITextH2SemiBoldLightStyled} from '../../fonts';
import {elements} from '../../../colors';

export const SSILoadingScreenActivityIndicatorContainerStyled = styled.View`
  margin-top: 282px;
`;

export const SSILoadingScreenActivityCaptionStyled = styled(SSITextH2SemiBoldLightStyled)`
  margin-top: 69px;
`;

export const SSILoadingScreenActivityIndicatorStyled = styled(ActivityIndicator).attrs({
  size: 80,
  color: elements.blue,
})``;
