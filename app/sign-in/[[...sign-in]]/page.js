import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'


export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto pt-8 pb-4">
        <SignIn />
        <Link 
          href="/" 
          className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Back to Home
        </Link>
      </div>
      
    </div>
  )
}