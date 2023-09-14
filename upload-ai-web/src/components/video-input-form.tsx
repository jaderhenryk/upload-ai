import { FileVideo, Upload } from "lucide-react";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { getFFmpeg } from "@/lib/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { api } from "@/lib/axios";

type Status = 'waiting' | 'uploading' | 'converting' | 'generating' | 'success'

const statusMessages = {
    converting: 'Convertendo...',
    generating: 'Trascrevendo...',
    uploading: 'Carrgando...',
    success: 'Sucesso!'
}

interface VideoInputFormProps {
    onVideoUploaded: (id: string) => void
}

export function VideoInputForm({ onVideoUploaded }: VideoInputFormProps) {
    const [videoFile, setVideoFile] = useState<File | null>(null)
    const [status, setStatus] = useState<Status>('waiting')

    const promptInputRef = useRef<HTMLTextAreaElement>(null)

    function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
        const { files } = event.currentTarget
        if (!files) {
            return
        }
        const selectedFile = files[0]
        setVideoFile(selectedFile)
    }

    async function convertVideoToAudio(video: File) {
        console.log('Convert began.')
        const ffmpeg = await getFFmpeg()
        await ffmpeg.writeFile('input.mp4', await fetchFile(video))
        ffmpeg.on('progress', progress => {
            console.log('Convert progress: ' + Math.round(progress.progress * 100))
        })
        await ffmpeg.exec([
            '-i',
            'input.mp4',
            '-map',
            '0:a',
            '-b:a',
            '20k',
            '-acodec',
            'libmp3lame',
            'output.mp3'
        ])
        const data = await ffmpeg.readFile('output.mp3')
        const audioFileBlob = new Blob([data], { type: 'audio/mpeg' })
        const audioFile = new File([audioFileBlob], 'audio.mp3', {
            type: 'audio/mpeg'
        })
        console.log('Convert finished.')
        return  audioFile
    }

    async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!videoFile) {
            return
        }
        setStatus('converting')
        const prompt = promptInputRef.current?.value
        const audioFile = await convertVideoToAudio(videoFile)
        
        const data = new FormData()
        data.append('file', audioFile)
        setStatus('uploading')
        const response = await api.post('/videos', data)
        
        const videoId = response.data.video.id
        setStatus('generating')
        await api.post(`/videos/${videoId}/transcription`, {
            prompt
        })
        setStatus('success')
        onVideoUploaded(videoId)
        console.log('Finished')
    }

    const previewURL = useMemo(() => {
        if (!videoFile) {
            return null
        }
        return URL.createObjectURL(videoFile)
    }, [videoFile])

    return (
        <form className="space-y-6" onSubmit={handleUploadVideo}>
            <label htmlFor="video" className="relative flex flex-col items-center justify-center gap-2 rounded-md aspect-video cursor-progress border border-dashed text-sm text-muted-foreground hover:bg-primary/5">
            {previewURL ? (
                <video src={previewURL} controls={false} className="pointer-events-none absolute inset-0"/>
            ) : (
                <>
                    <FileVideo className="w-4 h-4"/>
                    Selecione um vídeo
                </>
            )}
            </label>
            <input type="file" id="video" accept="video/mp4" className="sr-only" onChange={handleFileSelected}/>
            <Separator/>
            <div className="space-y-2">
                <Label htmlFor="transcription_prompt">
                    Prompt de transcrição
                </Label>
                <Textarea
                    id="transcription_prompt"
                    className="h-20 leading-relaxed resize-none"
                    placeholder="Inclua palavras-chave mencionadas no vídeo separadas por vígula(,)"
                    ref={promptInputRef}
                    disabled={status !== 'waiting'}
                />
            </div>
            <Button 
                disabled={status !== 'waiting'}
                type="submit"
                className="w-full data-[success=true]:bg-emerald-400"
                data-success={status === 'success'}
            >
            {status === 'waiting' ? (
                <>
                    Carregar vídeo
                    <Upload className="w-4 h-4 ml-2"/>
                </>
            ) : statusMessages[status]}
            </Button>
        </form>
    )
}