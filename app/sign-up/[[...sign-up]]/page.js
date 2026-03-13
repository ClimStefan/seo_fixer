import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto pt-8 pb-4">
        <SignUp />
        <Link 
          href="/" 
          className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Back to Home
        </Link>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
  <p className="text-blue-800 text-sm">
    <strong>Start with 3 free searches!</strong> No credit card required. Upgrade anytime.
  </p>
</div>
      </div>
      
    </div>
  )
}