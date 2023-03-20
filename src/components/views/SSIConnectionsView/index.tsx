import { IIdentity } from '@sphereon/ssi-sdk-data-store'
import React, { FC } from 'react'
import { ListRenderItemInfo, RefreshControl } from 'react-native'
import { SwipeListView } from 'react-native-swipe-list-view'

import { OVERVIEW_INITIAL_NUMBER_TO_RENDER } from '../../../@config/constants'
import { SSIConnectionsViewContainerStyled as Container } from '../../../styles/components' // TODO styling
import SSIConnectionViewItem from '../SSIConnectionViewItem'
import SSISwipeRowViewItem from '../SSISwipeRowViewItem'

export interface IProps {
  identities: Array<IIdentity>
}

const SSIIdentitiesView: FC<IProps> = (props: IProps): JSX.Element => {
  const { identities } = props
  const [refreshing, setRefreshing] = React.useState(false)

  const onRefresh = async (): Promise<void> => {
    setRefreshing(false)
  }

  const onDelete = async (): Promise<void> => {
    console.log('Delete identity pressed!')
  }

  const onItemPress = async (identity: IIdentity): Promise<void> => {
    console.log('Identity pressed!')
  }

  const renderItem = (itemInfo: ListRenderItemInfo<IIdentity>): JSX.Element => (
    <SSISwipeRowViewItem
      listIndex={itemInfo.index}
      viewItem={
        <SSIConnectionViewItem
          // TODO we need a connection name
          name={itemInfo.item.alias}
          // TODO we need a connection uri which currently is not available
          uri={'N/A'}
        />
      }
      onPress={() => onItemPress(itemInfo.item)}
      onDelete={onDelete}
    />
  )

  return (
    <Container>
      <SwipeListView
        data={identities}
        keyExtractor={(itemInfo: IIdentity) => itemInfo.id}
        renderItem={renderItem}
        closeOnRowOpen
        closeOnRowBeginSwipe
        useFlatList
        initialNumToRender={OVERVIEW_INITIAL_NUMBER_TO_RENDER}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </Container>
  )
}

export default SSIIdentitiesView
