import { useCallback, useEffect, useState } from 'react'
import { Share, StyleSheet, Text, View } from 'react-native'
import {
  deleteCampaign, getCampaignAnalytics, getCampaigns, getTicketTypes, saveCampaign,
  type CampaignAnalytics, type PromoCampaign, type TicketType,
} from '../../api/events'
import { DateField } from '../../components/DateField'
import { Badge, Button, Card, Empty, Field, Header, Row, Segmented, Toggle, text } from '../../components/ui'
import { shareApiFile } from '../../lib/files'
import { errorMessage, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

type DiscountType = PromoCampaign['discountType']
type Draft = { code: string; discountType: DiscountType; discountValue: string; startsAt: string; endsAt: string; maxRedemptions: string; ticketTypeIds: string[] }

const emptyDraft: Draft = { code: '', discountType: 'Percentage', discountValue: '', startsAt: '', endsAt: '', maxRedemptions: '', ticketTypeIds: [] }

/** Promo codes with Campaign QR links and their sales (SRS 4.14). */
export function Campaigns({ event, onError, onMessage }: TabProps) {
  const { t } = useLocale()
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [analytics, setAnalytics] = useState<CampaignAnalytics[]>([])
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [editing, setEditing] = useState<PromoCampaign | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [campaignRows, analyticsRows, ticketRows] = await Promise.all([getCampaigns(event.id), getCampaignAnalytics(event.id), getTicketTypes(event.id)])
    setCampaigns(campaignRows)
    setAnalytics(analyticsRows)
    setTickets(ticketRows)
  }, [event.id])

  useEffect(() => {
    let active = true
    Promise.all([getCampaigns(event.id), getCampaignAnalytics(event.id), getTicketTypes(event.id)])
      .then(([campaignRows, analyticsRows, ticketRows]) => {
        if (!active) return
        setCampaigns(campaignRows)
        setAnalytics(analyticsRows)
        setTickets(ticketRows)
      })
      .catch((err: unknown) => { if (active) onError(errorMessage(err, t('manageEvent.campaignsLoadError'))) })
    return () => { active = false }
  }, [event.id, onError, t])

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  function edit(campaign: PromoCampaign | null) {
    setEditing(campaign)
    setDraft(campaign ? {
      code: campaign.code, discountType: campaign.discountType, discountValue: String(campaign.discountValue),
      startsAt: campaign.startsAt ?? '', endsAt: campaign.endsAt ?? '',
      maxRedemptions: campaign.maxRedemptions ? String(campaign.maxRedemptions) : '', ticketTypeIds: campaign.ticketTypeIds,
    } : emptyDraft)
  }

  async function save() {
    if (!draft.code.trim() || !draft.discountValue) {
      onError(t('form.required'))
      return
    }
    onError('')
    onMessage('')
    setBusy(true)
    try {
      await saveCampaign(event.id, {
        code: draft.code.trim().toUpperCase(),
        discountType: draft.discountType,
        discountValue: Number(draft.discountValue.replace(',', '.')),
        startsAt: draft.startsAt || null,
        endsAt: draft.endsAt || null,
        maxRedemptions: draft.maxRedemptions ? Number(draft.maxRedemptions) : null,
        ticketTypeIds: draft.ticketTypeIds,
      }, editing?.id)
      onMessage(editing ? t('manageEvent.campaignUpdated') : t('manageEvent.campaignCreated'))
      edit(null)
      await refresh()
    } catch (err) {
      onError(errorMessage(err, t('manageEvent.campaignSaveError')))
    } finally {
      setBusy(false)
    }
  }

  async function remove(campaignId: string) {
    onError('')
    try {
      await deleteCampaign(event.id, campaignId)
      await refresh()
      onMessage(t('manageEvent.campaignRemoved'))
    } catch (err) {
      onError(errorMessage(err, t('manageEvent.campaignRemoveError')))
    }
  }

  function toggleType(id: string, on: boolean) {
    setDraft((current) => ({ ...current, ticketTypeIds: on ? [...current.ticketTypeIds, id] : current.ticketTypeIds.filter((item) => item !== id) }))
  }

  return (
    <View style={styles.gap}>
      <Header title={t('manageEvent.campaignsTitle')} subtitle={t('manageEvent.campaignsText')} />
      {campaigns.length === 0 ? <Empty title={t('manageEvent.noCampaigns')} /> : campaigns.map((campaign) => {
        const stats = analytics.find((item) => item.campaignId === campaign.id)
        return (
          <Card key={campaign.id}>
            <View style={styles.row}>
              <Text style={[text.heading, styles.flex]}>{campaign.code}</Text>
              <Badge label={campaign.isEnabled ? t('manageEvent.active') : t('manageEvent.disabled')} tone={campaign.isEnabled ? 'success' : 'neutral'} />
            </View>
            <Text style={text.body}>
              {campaign.discountType === 'Percentage' ? t('manageEvent.percentOff', { value: campaign.discountValue }) : t('manageEvent.amountOff', { amount: formatKzt(campaign.discountValue) })} · {t('manageEvent.redemptions', { count: campaign.redemptions })}
            </Text>
            <Text selectable style={text.muted}>{campaign.campaignUrl}</Text>
            {stats && (
              <View>
                <Row label={t('manageEvent.statTickets')} value={String(stats.ticketsSold)} />
                <Row label={t('manageEvent.statGross')} value={formatKzt(stats.grossRevenue)} />
                <Row label={t('manageEvent.statNet')} value={formatKzt(stats.netRevenue)} strong />
              </View>
            )}
            <View style={styles.actions}>
              <Button small variant="secondary" label={t('mobile.share')} onPress={() => void Share.share({ message: campaign.campaignUrl })} />
              <Button small variant="secondary" label={t('manageEvent.downloadQr')} onPress={() => void shareApiFile(`/api/events/${event.id}/campaigns/${campaign.id}/qr`, `campaign-${campaign.code}.png`, 'image/png').catch((err: unknown) => onError(errorMessage(err, t('manageEvent.qrError'))))} />
              <Button small variant="secondary" label={t('common.edit')} onPress={() => edit(campaign)} />
              <Button small variant="danger" label={t('manageEvent.disable')} onPress={() => void remove(campaign.id)} />
            </View>
          </Card>
        )
      })}

      <Card style={styles.gap}>
        <Text style={text.heading}>{editing ? t('manageEvent.editCampaign') : t('manageEvent.createCampaign')}</Text>
        <Text style={text.muted}>{t('manageEvent.campaignHint')}</Text>
        <Field label={t('event.promo')} value={draft.code} onChangeText={set('code')} autoCapitalize="characters" maxLength={40} />
        <Text style={text.label}>{t('manageEvent.discountType')}</Text>
        <Segmented value={draft.discountType} onChange={set('discountType')} items={[{ value: 'Percentage', label: t('manageEvent.discount.Percentage') }, { value: 'FixedKzt', label: t('manageEvent.discount.FixedKzt') }]} />
        <Field label={t('manageEvent.value')} value={draft.discountValue} onChangeText={set('discountValue')} keyboardType="decimal-pad" />
        <Field label={t('manageEvent.maxRedemptions')} value={draft.maxRedemptions} onChangeText={set('maxRedemptions')} keyboardType="number-pad" />
        <DateField label={t('createEvent.starts')} value={draft.startsAt} onChange={set('startsAt')} optional />
        <DateField label={t('createEvent.ends')} value={draft.endsAt} onChange={set('endsAt')} optional />
        {tickets.length > 0 && (
          <View>
            <Text style={text.label}>{t('manageEvent.appliesTo')}</Text>
            {tickets.map((ticket) => <Toggle key={ticket.id} label={ticket.name} value={draft.ticketTypeIds.includes(ticket.id)} onChange={(on) => toggleType(ticket.id, on)} />)}
            <Text style={text.muted}>{t('manageEvent.appliesHint')}</Text>
          </View>
        )}
        <Button label={busy ? t('common.saving') : editing ? t('manageEvent.saveCampaign') : t('manageEvent.createCampaign')} busy={busy} onPress={() => void save()} />
        {editing && <Button variant="ghost" label={t('manageEvent.cancelEditing')} onPress={() => edit(null)} />}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
