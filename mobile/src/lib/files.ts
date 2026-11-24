import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { apiBytes } from '../api/client'

/**
 * Downloads an authenticated API file and hands it to the system share sheet,
 * where the user can save, print or open it (PDF tickets, QR images, .ics, CSV).
 * The web preview downloads it like the website does.
 */
export async function shareApiFile(path: string, filename: string, mimeType: string) {
  const bytes = await apiBytes(path)

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return
  }

  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.create()
  await file.write(new Uint8Array(bytes))
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename })
}
