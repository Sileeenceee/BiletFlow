import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { deleteTicketType, getTicketTypes, saveTicketType, type TicketType } from '../../api/events'
import { DateField } from '../../components/DateField'
import { Badge, Button, Card, Empty, Field, Header, Toggle, text } from '../../components/ui'
import { confirmAction } from '../../lib/confirm'
import { errorMessage, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

type Draft = { name: string; description: string; price: string; quantity: string; maxPerOrder: string; salesStartAt: string; salesEndAt: string; isHidden: boolean }

const emptyDraft: Draft = { name: '', description: '', price: '0', quantity: '', maxPerOrder: '10', salesStartAt: '', salesEndAt: '', isHidden: false }
const toDraft = (type: TicketType): Draft => ({
  name: type.name, description: type.description ?? '', price: String(type.price), quantity: String(type.quantity),
  maxPerOrder: String(type.maxPerOrder), salesStartAt: type.salesStartAt ?? '', salesEndAt: type.salesEndAt ?? '', isHidden: type.isHidden,
})

export function Tickets({ event, onError, onMessage }: TabProps) {
  const { t } = useLocale()
  const [types, setTypes] = useState<TicketType[]>([])
  const [editing, setEditing] = useState<TicketType | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getTicketTypes(event.id).then(setTypes).catch((err: unknown) => onError(errorMessage(err, t('manageEvent.ticketsLoadError'))))
  }, [event.id, onError, t])

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  function edit(type: TicketType | null) {
    setEditing(type)
    setDraft(type ? toDraft(type) : emptyDraft)
  }

  async function save() {
    if (!draft.name.trim() || !draft.quantity) {
      onError(t('form.required'))
      return
    }
    onError('')
    onMessage('')
    setBusy(true)
    try {
      const saved = await saveTicketType(event.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        price: Number(draft.price.replace(',', '.')) || 0,
        quantity: Number(draft.quantity),
        maxPerOrder: Number(draft.maxPerOrder) || 10,
        salesStartAt: draft.salesStartAt || null,
        salesEndAt: draft.salesEndAt || null,
        isHidden: draft.isHidden,
      }, editing?.id)
      setTypes((current) => editing ? current.map((type) => type.id === saved.id ? saved : type) : [...current, saved])
      onMessage(editing ? t('manageEvent.typeUpdated') : t('manageEvent.typeCreated'))
      edit(null)
    } catch (err) {
      onError(errorMessage(err, t('manageEvent.typeSaveError')))
    } finally {
      setBusy(false)
    }
  }

  function remove(type: TicketType) {
    confirmAction(t('common.delete'), type.name, t('common.delete'), t('common.cancel'), () => {
      onError('')
      deleteTicketType(event.id, type.id)
        .then(() => {
          setTypes((current) => current.filter((item) => item.id !== type.id))
          onMessage(t('manageEvent.typeDeleted'))
        })
        .catch((err: unknown) => onError(errorMessage(err, t('manageEvent.typeDeleteError'))))
    })
  }

  return (
    <View style={styles.gap}>
      <Header title={t('manageEvent.inventoryTitle')} subtitle={t('manageEvent.inventoryText', { title: event.title })} />
      <Text style={text.muted}>{t('manageEvent.typeCount', { count: types.length })}</Text>
      {types.length === 0 ? <Empty title={t('manageEvent.noTypes')} /> : types.map((type) => (
        <Card key={type.id}>
          <View style={styles.row}>
            <Text style={[text.subheading, styles.flex]}>{type.name}</Text>
            {type.isHidden && <Badge label={t('manageEvent.hidden')} />}
          </View>
          <Text style={text.body}>{type.price ? formatKzt(type.price) : t('event.free')}</Text>
          <Text style={text.muted}>{t('manageEvent.typeStats', { available: type.availableQuantity, reserved: type.reservedQuantity, sold: type.soldQuantity, refunded: type.refundedQuantity, checkedIn: type.checkedInQuantity })}</Text>
          <View style={styles.row}>
            <Button small variant="secondary" label={t('common.edit')} onPress={() => edit(type)} />
            <Button small variant="danger" label={t('common.delete')} onPress={() => remove(type)} />
          </View>
        </Card>
      ))}

      <Card style={styles.gap}>
        <Text style={text.heading}>{editing ? t('manageEvent.editType') : t('manageEvent.addType')}</Text>
        <Text style={text.muted}>{t('manageEvent.typeHint')}</Text>
        <Field label={t('manageEvent.typeName')} value={draft.name} onChangeText={set('name')} maxLength={120} />
        <Field label={t('createEvent.description')} value={draft.description} onChangeText={set('description')} maxLength={1000} multiline />
        <View style={styles.row}>
          <View style={styles.flex}><Field label={t('manageEvent.price')} value={draft.price} onChangeText={set('price')} keyboardType="decimal-pad" /></View>
          <View style={styles.flex}><Field label={t('manageEvent.quantity')} value={draft.quantity} onChangeText={set('quantity')} keyboardType="number-pad" /></View>
        </View>
        <Field label={t('manageEvent.maxPerOrder')} value={draft.maxPerOrder} onChangeText={set('maxPerOrder')} keyboardType="number-pad" />
        <DateField label={t('manageEvent.salesStart')} value={draft.salesStartAt} onChange={set('salesStartAt')} optional />
        <DateField label={t('manageEvent.salesEnd')} value={draft.salesEndAt} onChange={set('salesEndAt')} optional />
        <Toggle label={t('manageEvent.hide')} value={draft.isHidden} onChange={set('isHidden')} />
        <Button label={busy ? t('common.saving') : editing ? t('manageEvent.saveType') : t('manageEvent.addType')} busy={busy} onPress={() => void save()} />
        {editing && <Button variant="ghost" label={t('manageEvent.cancelEditing')} onPress={() => edit(null)} />}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
